#!/bin/bash
set -eo pipefail

OUTPUT_FILE="docs/site/content/User/SoloCommands.md"
echo "# Solo Command Reference" > "$OUTPUT_FILE"

# Add Table of Contents placeholder
echo "## Table of Contents" >> "$OUTPUT_FILE"
echo -e "\n- [Root Help Output](#root-help-output)" >> "$OUTPUT_FILE"

# Get top-level commands (ignore errors safely)
COMMANDS=($(npm run solo -- --help | awk '/Commands:/ {flag=1; next} /Options:/ {flag=0} flag && NF && $1 != "" {print $1}' || true))

for cmd in "${COMMANDS[@]}"; do
    echo "Processing command: $cmd"
    echo -e "\n- [${cmd}](#${cmd})" >> "$OUTPUT_FILE"

    # Add subcommands if they exist
    SUBCOMMAND_OUTPUT=$(npm run solo -- "$cmd" --help 2>/dev/null || true)

    # Extract subcommands (suppress errors)
    SUBCOMMANDS=($(echo "$SUBCOMMAND_OUTPUT" | sed -n '/Commands:/,/Options:/p' | grep -E "^  $cmd \S+" | awk '{print $2}' || true))

    for subcmd in "${SUBCOMMANDS[@]}"; do
        echo "Processing subcommand: $cmd $subcmd"
        echo -e "\n  - [${cmd} $subcmd](#${cmd}-${subcmd})" >> "$OUTPUT_FILE"
    done
done

# Add the root help output
echo -e "\n## Root Help Output" >> "$OUTPUT_FILE"
echo '```' >> "$OUTPUT_FILE"
npm run solo -- --help >> "$OUTPUT_FILE"
echo '```' >> "$OUTPUT_FILE"

# Process each command
for cmd in "${COMMANDS[@]}"; do
    echo -e "\n## $cmd" >> "$OUTPUT_FILE"
    echo '```' >> "$OUTPUT_FILE"
    npm run solo -- "$cmd" --help >> "$OUTPUT_FILE"
    echo '```' >> "$OUTPUT_FILE"

    # Extract subcommands again safely
    SUBCOMMAND_OUTPUT=$(npm run solo -- "$cmd" --help 2>/dev/null || true)
    SUBCOMMANDS=($(echo "$SUBCOMMAND_OUTPUT" | sed -n '/Commands:/,/Options:/p' | grep -E "^  $cmd \S+" | awk '{print $2}' || true))

    for subcmd in "${SUBCOMMANDS[@]}"; do
        echo -e "\n### $cmd $subcmd" >> "$OUTPUT_FILE"
        echo '```' >> "$OUTPUT_FILE"
        npm run solo -- "$cmd" "$subcmd" --help >> "$OUTPUT_FILE"
        echo '```' >> "$OUTPUT_FILE"
    done
done

echo "Documentation saved to $OUTPUT_FILE"
