package cmd

// RuleConfig defines a verbose rule in the YAML config.
type RuleConfig struct {
	URL      string `mapstructure:"url"`
	Subpaths bool   `mapstructure:"subpaths"`
	Action   string `mapstructure:"action"` // "include" or "ignore"
}

// Config defines the top-level configuration structure.
type Config struct {
	Output     string       `mapstructure:"output"`
	Flat       bool         `mapstructure:"flat"`
	ConfigFile string       `mapstructure:"config"`
	FileRename string       `mapstructure:"file_rename"`
	Patterns   []string     `mapstructure:"patterns"`
	Rules      []RuleConfig `mapstructure:"rules"`
}
