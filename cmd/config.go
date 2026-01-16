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
