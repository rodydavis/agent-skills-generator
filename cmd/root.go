package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var rootCmd = &cobra.Command{
	Use:   "quantum-star",
	Short: "A Quantum Star CLI application",
	Long:  `A sample CLI application built with Cobra and Colly.`,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		// Initialize Config
		if err := initConfig(); err != nil {
			fmt.Printf("Config error: %v\n", err)
		}
	},
	Run: func(cmd *cobra.Command, args []string) {
		// Do Stuff Here
		fmt.Println("Welcome to Quantum Star CLI")
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
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
