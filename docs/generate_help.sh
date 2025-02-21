#!/bin/bash

OUTPUT_FILE="solo_commands.md"
echo "# Solo Command Reference" > "$OUTPUT_FILE"

echo "## Root Help Output" >> "$OUTPUT_FILE"
echo '\n```' >> "$OUTPUT_FILE"
npm run solo -- --help >> "$OUTPUT_FILE"
echo '\n```\n' >> "$OUTPUT_FILE"

# Get top-level commands
COMMANDS=($(npm run solo -- --help | awk '/Commands:/ {flag=1; next} /Options:/ {flag=0} flag && NF && $1 != "" {print $1}'))

echo "## Commands" >> "$OUTPUT_FILE"

for cmd in "${COMMANDS[@]}"; do
    echo "Processing command: $cmd"
    echo -e "\n## $cmd" >> "$OUTPUT_FILE"
    echo '\n```' >> "$OUTPUT_FILE"
    npm run solo -- "$cmd" --help >> "$OUTPUT_FILE"
    echo '\n```\n' >> "$OUTPUT_FILE"

    # Extract subcommands from the command help
    SUBCOMMANDS=($(npm run solo -- "$cmd" --help | sed -n '/Commands:/,/Options:/p' | grep -E "^  $cmd \S+" | awk '{print $2}'))

    if [ ${#SUBCOMMANDS[@]} -gt 0 ]; then
        # If there are subcommands, process them
        for subcmd in "${SUBCOMMANDS[@]}"; do
            echo "Processing subcommand: $cmd $subcmd"
            echo -e "\n### $cmd $subcmd" >> "$OUTPUT_FILE"
            echo '\n```' >> "$OUTPUT_FILE"
            npm run solo -- "$cmd" "$subcmd" --help >> "$OUTPUT_FILE"
            echo '\n```\n' >> "$OUTPUT_FILE"
        done
    else
        # If no subcommands, we skip further processing
        echo "No subcommands for $cmd"
    fi
done

echo "Documentation saved to $OUTPUT_FILE"
