// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package cmd

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"net/url"

	md "github.com/JohannesKaufmann/html-to-markdown"
	"github.com/PuerkitoBio/goquery"
	"github.com/gobwas/glob"
	"github.com/gocolly/colly/v2"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

// configFile holds the path to the configuration file.
// outputDir holds the path to the output directory.
// flatOutput indicates whether to use a flat directory structure.
// fileRename holds the optional filename to rename the output file to.
var (
	configFile string
	outputDir  string
	flatOutput bool
	fileRename string
)

// crawlCmd represents the crawl command.
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
	// Flags are now on rootCmd
}

// runCrawl executes the crawler logic.
// It loads the configuration, sets up the collector, and starts the crawl.
func runCrawl(cmd *cobra.Command) {
	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		fmt.Printf("Error unmarshalling config: %v\n", err)
		return
	}

	outputDir = cfg.Output
	flatOutput = cfg.Flat
	configFile = cfg.ConfigFile
	fileRename = cfg.FileRename

	allowedGlobs, ignoredGlobs, err := loadRules(&cfg)
	if err != nil {
		fmt.Printf("Error processing rules: %v\n", err)
		return
	}

	fmt.Printf("Loaded %d allowed patterns and %d ignored patterns\n", len(allowedGlobs), len(ignoredGlobs))

	c := colly.NewCollector(
		colly.Async(true),
	)

	c.Limit(&colly.LimitRule{
		DomainGlob:  "*",
		Parallelism: 4,
	})

	c.OnRequest(func(r *colly.Request) {
		_, fullPath := getOutputPath(r.URL, outputDir, flatOutput, fileRename)

		var mdPath string
		if fileRename != "" {
			mdPath = filepath.Join(filepath.Dir(fullPath), fileRename)
		} else {
			if strings.HasSuffix(fullPath, ".html") {
				mdPath = strings.TrimSuffix(fullPath, ".html") + ".md"
			} else {
				mdPath = fullPath + ".md"
			}
		}

		if info, err := os.Stat(mdPath); err == nil && !info.IsDir() {
			f, err := os.Open(mdPath)
			if err == nil {
				defer f.Close()
				scanner := bufio.NewScanner(f)
				for scanner.Scan() {
					line := scanner.Text()
					if strings.Contains(line, "last_modified:") {
						parts := strings.SplitN(line, ":", 2)
						if len(parts) == 2 {
							dateStr := strings.TrimSpace(parts[1])
							if dateStr != "" {
								r.Headers.Set("If-Modified-Since", dateStr)
							}
						}
						break
					}
				}
			}
		}
	})

	c.OnHTML("a[href]", func(e *colly.HTMLElement) {
		link := e.Attr("href")
		absLink := e.Request.AbsoluteURL(link)
		if absLink == "" {
			return
		}

		if shouldVisit(absLink, allowedGlobs, ignoredGlobs) {
			e.Request.Visit(absLink)
		}
	})

	c.OnResponse(func(r *colly.Response) {
		if r.StatusCode == 304 {
			fmt.Printf("Skipping %s (Not Modified)\n", r.Request.URL)
			return
		}

		fmt.Printf("Visited: %s\n", r.Request.URL)

		if !shouldVisit(r.Request.URL.String(), allowedGlobs, ignoredGlobs) {
			fmt.Printf("Skipping (not allowed/ignored): %s\n", r.Request.URL)
			return
		}

		saveResponse(r, outputDir)
	})

	c.OnError(func(r *colly.Response, err error) {
		fmt.Printf("Error visiting %s: %v\n", r.Request.URL, err)
	})

	for _, g := range allowedGlobs {
		seed := getSeedURL(g.pattern)
		if seed != "" {
			fmt.Printf("Seeding: %s\n", seed)
			c.Visit(seed)
		}
	}

	c.Wait()
}

// globRule represents a compiled glob pattern.
type globRule struct {
	pattern string
	g       glob.Glob
}

// loadRules merges rules from the external file and the config struct.
func loadRules(cfg *Config) ([]globRule, []globRule, error) {
	var allowed []globRule
	var ignored []globRule

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
			fmt.Printf("Warning opening config file: %v\n", err)
		}
	}

	for _, p := range cfg.Patterns {
		processPattern(p)
	}

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

// shouldVisit checks if a link should be visited based on allowed and ignored rules.
func shouldVisit(link string, allowed, ignored []globRule) bool {
	for _, rule := range ignored {
		if rule.g.Match(link) {
			return false
		}
	}

	for _, rule := range allowed {
		if rule.g.Match(link) {
			return true
		}
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

// saveResponse saves the response body to a file and converts it to markdown.
func saveResponse(r *colly.Response, outDir string) {
	contentType := r.Headers.Get("Content-Type")
	if !strings.Contains(strings.ToLower(contentType), "text/html") {
		return
	}

	dirName, fullPath := getOutputPath(r.Request.URL, outDir, flatOutput, fileRename)

	if err := os.MkdirAll(dirName, 0755); err != nil {
		fmt.Printf("Error creating dir %s: %v\n", dirName, err)
		return
	}

	if err := os.WriteFile(fullPath, r.Body, 0644); err != nil {
		fmt.Printf("Error writing html file %s: %v\n", fullPath, err)
	}

	title, description, err := extractMetadata(r.Body)
	if err != nil {
		fmt.Printf("Error extracting metadata for %s: %v\n", fullPath, err)
	}
	if title == "" {
		title = "Untitled"
	}
	if description == "" {
		description = "No description available."
	}

	cleanHTML, err := extractContent(r.Body)
	if err != nil {
		fmt.Printf("Error extracting content for %s: %v\n", fullPath, err)
		return
	}

	converter := md.NewConverter("", true, nil)
	markdownBody, err := converter.ConvertString(cleanHTML)
	if err != nil {
		fmt.Printf("Error converting to markdown for %s: %v\n", fullPath, err)
		return
	}

	var name string
	if flatOutput {
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

	var mdPath string
	if fileRename != "" {
		mdPath = filepath.Join(filepath.Dir(fullPath), fileRename)
	} else {
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

// extractMetadata extracts the title and description from the HTML body.
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

// extractContent extracts the main content from the HTML body.
func extractContent(body []byte) (string, error) {
	doc, err := goquery.NewDocumentFromReader(bytes.NewReader(body))
	if err != nil {
		return "", err
	}

	selection := doc.Find("body")

	article := doc.Find("article")
	if article.Length() > 0 {
		selection = article
	}

	selection.Find("header#site-content-title").Remove()
	selection.Find(".toc").Remove()

	return selection.Html()
}

// toPathCase converts a string to path case (kebab-case).
func toPathCase(s string) string {
	s = strings.ToLower(s)
	re := regexp.MustCompile(`[^a-z0-9]+`)
	s = re.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

// getSeedURL returns the seed URL from a glob pattern.
func getSeedURL(pattern string) string {
	idx := strings.Index(pattern, "*")
	if idx != -1 {
		return pattern[:idx]
	}
	return pattern
}
