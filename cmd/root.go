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
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var rootCmd = &cobra.Command{
	Use:   "agent-skills-generator",
	Short: "A CLI tool to crawl websites and generate markdown skills",
	Long: `A CLI tool that crawls documentation websites and converts them into 
Markdown files suitable for agentic skills and knowledge bases.`,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		// Initialize Config
		if err := initConfig(); err != nil {
			fmt.Printf("Config error: %v\n", err)
		}
	},
	// Run the crawl command by default if no subcommand is specified
	Run: func(cmd *cobra.Command, args []string) {
		runCrawl(cmd)
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

func init() {
	// Global persistent flags
	rootCmd.PersistentFlags().StringVar(&configFile, "config", ".skillscontext", "config file path")
	rootCmd.PersistentFlags().StringVar(&outputDir, "output", ".skillscache", "output directory")
	rootCmd.PersistentFlags().BoolVar(&flatOutput, "flat", false, "save files in a flat directory structure")
	rootCmd.PersistentFlags().StringVar(&fileRename, "rename", "", "rename output markdown file (e.g. SKILL.md)")

	// Bind viper to these persistent flags
	viper.BindPFlag("config", rootCmd.PersistentFlags().Lookup("config"))
	viper.BindPFlag("output", rootCmd.PersistentFlags().Lookup("output"))
	viper.BindPFlag("flat", rootCmd.PersistentFlags().Lookup("flat"))
	viper.BindPFlag("file_rename", rootCmd.PersistentFlags().Lookup("rename"))
}

func initConfig() error {
	viper.SetConfigName("skills") // name of config file (without extension)
	viper.SetConfigType("yaml")   // REQUIRED if the config file does not have the extension in the name
	viper.AddConfigPath(".")      // optionally look for config in the working directory

	// Check if file exists to avoid error if missing
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); ok {
			// Config file not found; ignore error if desired
		} else {
			// Config file was found but another error was produced
			return err
		}
	}
	return nil
}
