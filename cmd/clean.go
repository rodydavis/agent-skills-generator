package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var cleanCmd = &cobra.Command{
	Use:   "clean",
	Short: "Clean the output directory",
	Long:  `Removes the output directory (default: .skillscache) and all its contents.`,
	Run: func(cmd *cobra.Command, args []string) {
		// Check viper for output dir override if flag not changed
		if !cmd.Flags().Changed("output") && viper.IsSet("output") {
			outputDir = viper.GetString("output")
		}

		fmt.Printf("Cleaning output directory: %s\n", outputDir)
		err := os.RemoveAll(outputDir)
		if err != nil {
			fmt.Printf("Error cleaning directory: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Clean complete.")
	},
}

func init() {
	rootCmd.AddCommand(cleanCmd)
	// Reuse outputDir variable from crawl.go since it's in the same package
	cleanCmd.Flags().StringVar(&outputDir, "output", ".skillscache", "output directory to clean")
	viper.BindPFlag("output", cleanCmd.Flags().Lookup("output"))
}
