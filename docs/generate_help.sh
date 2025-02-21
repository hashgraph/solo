#!/bin/bash

OUTPUT_FILE="docs/content/User/SoloCommands.md"
echo "# Solo Command Reference" > "$OUTPUT_FILE"

# Add Table of Contents placeholder
echo "## Table of Contents" >> "$OUTPUT_FILE"
echo -e "\n- [Root Help Output](#root-help-output)" >> "$OUTPUT_FILE"
TOC_COMMANDS=()

# Get top-level commands
COMMANDS=($(npm run solo -- --help | awk '/Commands:/ {flag=1; next} /Options:/ {flag=0} flag && NF && $1 != "" {print $1}'))

for cmd in "${COMMANDS[@]}"; do
    TOC_COMMANDS+=("- [${cmd}](#${cmd})")
    echo -e "\n- [${cmd}](#${cmd})" >> "$OUTPUT_FILE"
    # Add subcommands if they exist
    SUBCOMMANDS=($(npm run solo -- "$cmd" --help | sed -n '/Commands:/,/Options:/p' | grep -E "^  $cmd \S+" | awk '{print $2}'))

    for subcmd in "${SUBCOMMANDS[@]}"; do
        TOC_COMMANDS+=("- [${cmd} $subcmd](#${cmd}-${subcmd})")
        echo -e "\n    - [${cmd} $subcmd](#${cmd}-${subcmd})" >> "$OUTPUT_FILE"
    done
done

# Add the root help output to TOC
echo -e "\n## Root Help Output" >> "$OUTPUT_FILE"
echo '```' >> "$OUTPUT_FILE"
npm run solo -- --help >> "$OUTPUT_FILE"
echo '```' >> "$OUTPUT_FILE"

# Now we process each command and subcommand to generate their documentation
for cmd in "${COMMANDS[@]}"; do
    echo "Processing command: $cmd"
    echo -e "\n## Command: $cmd" >> "$OUTPUT_FILE"
    echo '```' >> "$OUTPUT_FILE"
    npm run solo -- "$cmd" --help >> "$OUTPUT_FILE"
    echo '```' >> "$OUTPUT_FILE"

    # Extract subcommands from the command help
    SUBCOMMANDS=($(npm run solo -- "$cmd" --help | sed -n '/Commands:/,/Options:/p' | grep -E "^  $cmd \S+" | awk '{print $2}'))

    if [ ${#SUBCOMMANDS[@]} -gt 0 ]; then
        # If there are subcommands, process them
        for subcmd in "${SUBCOMMANDS[@]}"; do
            echo "Processing subcommand: $cmd $subcmd"
            echo -e "\n### $cmd $subcmd" >> "$OUTPUT_FILE"
            echo '```' >> "$OUTPUT_FILE"
            npm run solo -- "$cmd" "$subcmd" --help >> "$OUTPUT_FILE"
            echo '```' >> "$OUTPUT_FILE"
        done
    else
        # If no subcommands, we skip further processing
        echo "No subcommands for $cmd"
    fi
done

echo "Documentation saved to $OUTPUT_FILE"
