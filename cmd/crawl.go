package cmd

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	md "github.com/JohannesKaufmann/html-to-markdown"
	"github.com/PuerkitoBio/goquery"
	"github.com/gobwas/glob"
	"github.com/gocolly/colly/v2"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var (
	configFile string
	outputDir  string
	flatOutput bool
	fileRename string
)

var crawlCmd = &cobra.Command{
	Use:   "crawl",
	Short: "Crawl URLs based on context file",
	Long:  `Crawl URLs defined in .skillscontext file and save them to .skillscache`,
	Run: func(cmd *cobra.Command, args []string) {
		runCrawl(cmd)
	},
}

func init() {
	rootCmd.AddCommand(crawlCmd)
	crawlCmd.Flags().StringVar(&configFile, "config", ".skillscontext", "config file path")
	crawlCmd.Flags().StringVar(&outputDir, "output", ".skillscache", "output directory")
	crawlCmd.Flags().BoolVar(&flatOutput, "flat", false, "save files in a flat directory structure")
	crawlCmd.Flags().StringVar(&fileRename, "rename", "", "rename output markdown file (e.g. SKILL.md)")

	viper.BindPFlag("config", crawlCmd.Flags().Lookup("config"))
	viper.BindPFlag("output", crawlCmd.Flags().Lookup("output"))
	viper.BindPFlag("flat", crawlCmd.Flags().Lookup("flat"))
	viper.BindPFlag("file_rename", crawlCmd.Flags().Lookup("rename"))
}

// runCrawl wraps the execution logic to use viper values if flags aren't explicitly set
func runCrawl(cmd *cobra.Command) {
	// Load configuration into struct
	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		fmt.Printf("Error unmarshalling config: %v\n", err)
		return
	}

	// Manual flag overrides (since unmarshal might not catch them if not bound??
	// Viper BindPFlags should handle this, but let's be safe and explicit about precedence if needed.
	// Actually, viper.Unmarshal uses the values from the bound flags if they have precedence.

	// Ensure we respect the manual string var bindings if they were set?
	// The manual variables (configFile, outputDir) are pointers bound to flags.
	// If the flag was set, `configFile` has the value.
	// If we use `viper.GetString("config")`, it also respects the flag if bound.
	// We bound valid keys "config", "output", "flat" to flags in init().
	// So `cfg` should be correct.

	// Update package-level vars (used in saveResponse)
	outputDir = cfg.Output
	flatOutput = cfg.Flat
	configFile = cfg.ConfigFile
	fileRename = cfg.FileRename

	// 1. Parse config (merged from file and inline)
	allowedGlobs, ignoredGlobs, err := loadRules(&cfg)
	if err != nil {
		fmt.Printf("Error processing rules: %v\n", err)
		return
	}

	fmt.Printf("Loaded %d allowed patterns and %d ignored patterns\n", len(allowedGlobs), len(ignoredGlobs))

	// 2. Setup Colly
	c := colly.NewCollector(
		colly.Async(true),
	)

	// Limit parallelism
	c.Limit(&colly.LimitRule{
		DomainGlob:  "*",
		Parallelism: 4,
	})

	// 3. Handlers
	c.OnHTML("a[href]", func(e *colly.HTMLElement) {
		link := e.Attr("href")
		absLink := e.Request.AbsoluteURL(link)
		if absLink == "" {
			return
		}

		// Check if we should visit
		if shouldVisit(absLink, allowedGlobs, ignoredGlobs) {
			e.Request.Visit(absLink)
		}
	})

	c.OnResponse(func(r *colly.Response) {
		fmt.Printf("Visited: %s\n", r.Request.URL)

		// Enforce rules on final URL (handles redirects)
		if !shouldVisit(r.Request.URL.String(), allowedGlobs, ignoredGlobs) {
			fmt.Printf("Skipping (not allowed/ignored): %s\n", r.Request.URL)
			return
		}

		saveResponse(r, outputDir)
	})

	c.OnError(func(r *colly.Response, err error) {
		fmt.Printf("Error visiting %s: %v\n", r.Request.URL, err)
	})

	// 4. Start seeding
	// We need to find initial URLs to start with.
	// For simplicity, we can try to extract a base URL from the first allowed glob
	// or just accept an argument.
	// But the requirement says "crawl all urls... matching the rules".
	// Typically we need at least one entry point.
	// Let's assume the user wants to start from the base of the allowed globs that are not wildcards if possible,
	// or we can just expect them to provide a starting URL, BUT the prompt implies
	// it should just work from the config.
	// A common pattern like `https://docs.flutter.dev/*` implies we might want to start at `https://docs.flutter.dev/`.

	// Let's derive seed URLs from allowed patterns (stripping wildcards)
	for _, g := range allowedGlobs {
		// This is a heuristic.
		// If we have `https://domain.com/*`, we visit `https://domain.com/`
		// We can't really "visit" a glob, so we have to guess the entry point.
		seed := getSeedURL(g.pattern)
		if seed != "" {
			fmt.Printf("Seeding: %s\n", seed)
			c.Visit(seed)
		}
	}

	c.Wait()
}

type globRule struct {
	pattern string
	g       glob.Glob
}

// loadRules merges rules from the external file and the config struct.
func loadRules(cfg *Config) ([]globRule, []globRule, error) {
	var allowed []globRule
	var ignored []globRule

	// Helper to process a pattern string
	processPattern := func(pattern string) {
		pattern = strings.TrimSpace(pattern)
		if pattern == "" || strings.HasPrefix(pattern, "#") {
			return
		}

		isIgnore := false
		if strings.HasPrefix(pattern, "!") {
			isIgnore = true
			pattern = strings.TrimPrefix(pattern, "!")
		}

		g, err := glob.Compile(pattern)
		if err != nil {
			fmt.Printf("Warning: invalid glob %s: %v\n", pattern, err)
			return
		}

		rule := globRule{pattern: pattern, g: g}
		if isIgnore {
			ignored = append(ignored, rule)
		} else {
			allowed = append(allowed, rule)
		}
	}

	// 1. Load from external config file if it exists
	if cfg.ConfigFile != "" {
		f, err := os.Open(cfg.ConfigFile)
		if err == nil {
			defer f.Close()
			scanner := bufio.NewScanner(f)
			for scanner.Scan() {
				processPattern(scanner.Text())
			}
			if err := scanner.Err(); err != nil {
				fmt.Printf("Warning reading config file: %v\n", err)
			}
		} else if !os.IsNotExist(err) {
			// Only report if it's an error other than "not found"
			// (since default is .skillscontext which might not exist)
			fmt.Printf("Warning opening config file: %v\n", err)
		}
	}

	// 2. Load inline patterns
	for _, p := range cfg.Patterns {
		processPattern(p)
	}

	// 3. Load verbose rules
	for _, r := range cfg.Rules {
		pat := r.URL
		if r.Subpaths {
			if !strings.HasSuffix(pat, "*") {
				if !strings.HasSuffix(pat, "/") {
					pat += "/"
				}
				pat += "*"
			}
		}

		if r.Action == "ignore" {
			pat = "!" + pat
		}
		processPattern(pat)
	}

	return allowed, ignored, nil
}

func shouldVisit(link string, allowed, ignored []globRule) bool {
	// First check ignores
	for _, rule := range ignored {
		if rule.g.Match(link) {
			return false
		}
	}

	// Then check allowed
	for _, rule := range allowed {
		if rule.g.Match(link) {
			return true
		}
	}
	return false
}

	return false
}

// getOutputPath determines the directory and file path for the URL
func getOutputPath(u *url.URL, outDir string, flat bool, rename string) (string, string) {
	path := u.Path
	if path == "" || strings.HasSuffix(path, "/") {
		path = filepath.Join(path, "index.html")
	} else if !strings.HasSuffix(path, ".html") {
		// If path doesn't have extension, treat as directory -> index.html
		if filepath.Ext(path) == "" {
			path = filepath.Join(path, "index.html")
		}
	}

	var fullPath string
	if flat {
		// Flat structure: domain_path_to_file/index.md (or .html)
		segment := u.Path

		// Remove .html extension
		segment = strings.TrimSuffix(segment, ".html")

		// Remove /index suffix
		segment = strings.TrimSuffix(segment, "/index")

		// Remove trailing slash if present
		segment = strings.TrimSuffix(segment, "/")

		// Remove leading slash
		segment = strings.TrimPrefix(segment, "/")

		// Replace slashes with underscores
		segment = strings.ReplaceAll(segment, "/", "_")

		// Clean domian: replace dots with _
		cleanDomain := strings.ReplaceAll(u.Hostname(), ".", "_")

		// Construct directory name: domain_path
		var dirName string
		if segment == "" {
			dirName = cleanDomain
		} else {
			dirName = fmt.Sprintf("%s_%s", cleanDomain, segment)
		}

		// Save as index.html inside that directory
		fullPath = filepath.Join(outDir, dirName, "index.html")
	} else {
		// Hierarchical structure: .skillscache/<hostname>/<path>
		fullPath = filepath.Join(outDir, u.Hostname(), path)
	}
	
	dir := filepath.Dir(fullPath)
	return dir, fullPath
}

func saveResponse(r *colly.Response, outDir string) {
	// Only save HTML content
	contentType := r.Headers.Get("Content-Type")
	if contentType == "" {
		// Fallback: check body or assume html if unknown?
		// For strictness, let's require text/html or application/xhtml+xml
		// But often it might include charset e.g. "text/html; charset=utf-8"
	}
	if !strings.Contains(strings.ToLower(contentType), "text/html") {
		return
	}

	// Calculate paths
	dirName, fullPath := getOutputPath(r.Request.URL, outDir, flatOutput, fileRename)

	if err := os.MkdirAll(dirName, 0755); err != nil {
		fmt.Printf("Error creating dir %s: %v\n", dirName, err)
		return
	}

	// Save HTML
	if err := os.WriteFile(fullPath, r.Body, 0644); err != nil {
		fmt.Printf("Error writing html file %s: %v\n", fullPath, err)
	}

	// Extract Metadata
	title, description, err := extractMetadata(r.Body)
	if err != nil {
		fmt.Printf("Error extracting metadata for %s: %v\n", fullPath, err)
		// Proceed without metadata or with minimal defaults if needed
	}
	if title == "" {
		title = "Untitled"
	}
	if description == "" {
		description = "No description available."
	}

	// Extract Content for Markdown
	cleanHTML, err := extractContent(r.Body)
	if err != nil {
		fmt.Printf("Error extracting content for %s: %v\n", fullPath, err)
		return
	}

	// Convert to Markdown
	converter := md.NewConverter("", true, nil)
	markdownBody, err := converter.ConvertString(cleanHTML)
	if err != nil {
		fmt.Printf("Error converting to markdown for %s: %v\n", fullPath, err)
		return
	}

	// Prepare Frontmatter
	// Name should match folder name (if flat mode, we use the dir name we just calculated)
	var name string
	if flatOutput {
		// dirName returned by getOutputPath is the full path, we need just the last segment
		name = filepath.Base(dirName)
	} else {
		name = toPathCase(title)
	}
	
	metaUrl := r.Request.URL.String()
	lastModified := r.Headers.Get("Last-Modified")
	if lastModified == "" {
		lastModified = r.Headers.Get("Date")
	}
	frontmatter := fmt.Sprintf("---\nname: %s\ndescription: %s\nmetadata:\n  url: %s\n  last_modified: %s\n---\n\n# %s\n\n", name, description, metaUrl, lastModified, title)

	finalMarkdown := frontmatter + markdownBody

	// Save Markdown
	// Replace extension with .md (or append if it was index.html)
	// Actually we know fullPath ends in something.
	// If it ends in .html, replace it.
	var mdPath string
	if fileRename != "" {
		// If renaming, we use the directory of the HTML file and the new name
		mdPath = filepath.Join(filepath.Dir(fullPath), fileRename)
	} else {
		// Default behavior: same name as HTML but with .md extension
		if strings.HasSuffix(fullPath, ".html") {
			mdPath = strings.TrimSuffix(fullPath, ".html") + ".md"
		} else {
			mdPath = fullPath + ".md"
		}
	}

	if err := os.WriteFile(mdPath, []byte(finalMarkdown), 0644); err != nil {
		fmt.Printf("Error writing markdown file %s: %v\n", mdPath, err)
	}
}

func extractMetadata(body []byte) (string, string, error) {
	doc, err := goquery.NewDocumentFromReader(bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}

	title := doc.Find("meta[property='og:title']").AttrOr("content", "")
	if title == "" {
		title = doc.Find("title").Text()
	}

	description := doc.Find("meta[property='og:description']").AttrOr("content", "")
	if description == "" {
		description = doc.Find("meta[name='description']").AttrOr("content", "")
	}

	return strings.TrimSpace(title), strings.TrimSpace(description), nil
}

func extractContent(body []byte) (string, error) {
	doc, err := goquery.NewDocumentFromReader(bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	// Default to body
	selection := doc.Find("body")

	// Prefer article
	article := doc.Find("article")
	if article.Length() > 0 {
		selection = article
	}

	// Remove unwanted elements
	// Header with breadcrumbs and title (we add title manually in frontmatter)
	selection.Find("header#site-content-title").Remove()
	// Table of contents if present (often extraneous in markdown conversion if just a list of links)
	selection.Find(".toc").Remove()

	return selection.Html()
}

func toPathCase(s string) string {
	s = strings.ToLower(s)
	// Replace non-alphanumeric with -
	re := regexp.MustCompile(`[^a-z0-9]+`)
	s = re.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

func getSeedURL(pattern string) string {
	// Simple heuristic: take everything before the first wildcard
	// e.g. https://docs.flutter.dev/* -> https://docs.flutter.dev/
	idx := strings.Index(pattern, "*")
	if idx != -1 {
		return pattern[:idx]
	}
	return pattern
}
