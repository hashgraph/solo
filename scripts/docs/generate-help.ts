// SPDX-License-Identifier: Apache-2.0

import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCapture} from './utilities.js';
import chalk from 'chalk';
import {container} from 'tsyringe-neo';
import * as constants from '../../src/core/constants.js';
import {Container} from '../../src/core/dependency-injection/container-init.js';
import {InjectTokens} from '../../src/core/dependency-injection/inject-tokens.js';
import {type DeprecationRegistry} from '../../src/core/deprecation-registry.js';
import {Deprecations} from '../../src/core/deprecations.js';
import {type RegisteredDeprecation} from '../../src/types/registered-deprecation.js';
import {type AnyObject} from '../../src/types/aliases.js';

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const projectRoot: string = path.resolve(__dirname, '../../');
process.chdir(projectRoot);

const OUTPUT_FILE: string = path.join(projectRoot, 'docs/site/build/solo-cli.md');
const SOLO_COMMAND: string = 'npm run solo --silent --';

type SoloCommand = {
  output: string;
  versionOutput: string;
  topLevelCommands: TopLevelCommand[];
};

type TopLevelCommand = {
  parent: SoloCommand;
  topCommand: string;
  output: string;
  secondLevelCommands: SecondLevelCommand[];
};

type SecondLevelCommand = {
  parent: TopLevelCommand;
  secondCommand: string;
  output: string;
  thirdLevelCommands: ThirdLevelCommand[];
};

type ThirdLevelCommand = {
  parent: SecondLevelCommand;
  thirdCommand: string;
  output: string;
};

async function getTopLevelCommands(): Promise<SoloCommand> {
  try {
    const soloCommand: SoloCommand = {
      output: await runCapture(`${SOLO_COMMAND} --help`),
      versionOutput: await runCapture(`${SOLO_COMMAND} --version`),
      topLevelCommands: [],
    };
    console.log(`${chalk.cyan('✔ Finished retrieving top level commands')}`);
    // eslint-disable-next-line unicorn/no-array-reduce
    for (const command of soloCommand.output.split('\n').reduce(
      (
        accumulator: {inCommands: boolean; commands: string[]},
        line: string,
      ): {inCommands: boolean; commands: string[]} => {
        if (line.trim().startsWith('Commands:')) {
          accumulator.inCommands = true;
          return accumulator;
        }
        if (line.trim().startsWith('Options:')) {
          accumulator.inCommands = false;
          return accumulator;
        }
        if (accumulator.inCommands && line.trim()) {
          accumulator.commands.push(line.trim().split(/\s+/, 1)[0]);
        }
        return accumulator;
      },
      {inCommands: false, commands: []},
    ).commands) {
      soloCommand.topLevelCommands.push({
        parent: soloCommand,
        topCommand: command,
        output: undefined,
        secondLevelCommands: [],
      });
    }
    return soloCommand;
  } catch {
    console.log(chalk.red('❌ Failed to get top-level commands'));
    // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
    process.exit(1);
  }
}

async function getSecondLevelCommands(topLevelCommand: TopLevelCommand): Promise<void> {
  try {
    topLevelCommand.output = await runCapture(`${SOLO_COMMAND} ${topLevelCommand.topCommand} --help`);
    console.log(`${chalk.cyan('✔ Finished top level command: ')}${chalk.gray(topLevelCommand.topCommand)}`);
    const commands: string[] = topLevelCommand.output
      .split('\n')
      .filter((l): boolean => l.trim().startsWith(topLevelCommand.topCommand + ' '))
      .map((l): string => l.trim().split(/\s+/, 2)[1]);

    for (const secondLevelCommand of commands) {
      topLevelCommand.secondLevelCommands.push({
        parent: topLevelCommand,
        secondCommand: secondLevelCommand,
        output: undefined,
        thirdLevelCommands: [],
      });
    }
  } catch {
    console.log(chalk.red(`❌ Failed to get subcommands for ${topLevelCommand.topCommand}`));
    // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
    process.exit(1);
  }
}

async function getThirdLevelCommands(secondLevelCommand: SecondLevelCommand): Promise<void> {
  const {
    parent: {topCommand},
    secondCommand,
  }: SecondLevelCommand = secondLevelCommand;
  try {
    secondLevelCommand.output = await runCapture(`${SOLO_COMMAND} ${topCommand} ${secondCommand} --help`);
    console.log(`${chalk.cyan('✔ Finished second level command: ')}${chalk.gray(`${topCommand} ${secondCommand}`)}`);

    const commands: string[] = secondLevelCommand.output
      .split('\n')
      .filter((l): boolean => l.trim().startsWith(`${topCommand} ${secondCommand} `))
      .map((l): string => l.trim().split(/\s+/, 3)[2]);

    for (const thirdLevelCommand of commands) {
      secondLevelCommand.thirdLevelCommands.push({
        parent: secondLevelCommand,
        thirdCommand: thirdLevelCommand,
        output: undefined,
      });
    }
  } catch {
    console.log(chalk.red(`❌ Failed to get third-level commands for ${topCommand} ${secondCommand}`));
    // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
    process.exit(1);
  }
}

async function getOutputForThirdLevelCommand(thirdLevelCommand: ThirdLevelCommand): Promise<void> {
  const {
    parent: {
      parent: {topCommand},
      secondCommand,
    },
    thirdCommand,
  }: ThirdLevelCommand = thirdLevelCommand;
  try {
    thirdLevelCommand.output = await runCapture(
      `${SOLO_COMMAND} ${topCommand} ${secondCommand} ${thirdCommand} --help`,
    );
    console.log(
      `${chalk.cyan('✔ Finished third level command: ')}${chalk.gray(`${topCommand} ${secondCommand} ${thirdCommand}`)}`,
    );
  } catch {
    console.log(chalk.red(`❌ Failed to get output for ${topCommand} ${secondCommand} ${thirdCommand}`));
    // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
    process.exit(1);
  }
}

function collectDeprecations(): RegisteredDeprecation[] {
  Container.getInstance().init(constants.SOLO_HOME_DIR, constants.SOLO_CACHE_DIR, constants.SOLO_LOG_LEVEL);
  const commands: AnyObject = container.resolve(InjectTokens.Commands);
  // Building the command definitions registers every deprecated command/subcommand into the registry.
  commands.getCommandDefinitions();
  const registry: DeprecationRegistry = container.resolve<DeprecationRegistry>(InjectTokens.DeprecationRegistry);
  return registry.list();
}

function renderDeprecatedFeaturesSection(): string {
  let deprecations: RegisteredDeprecation[];
  try {
    deprecations = collectDeprecations();
  } catch (error) {
    // best-effort: deprecations are also marked inline in the help output below, so a failure here is not fatal.
    console.log(
      chalk.yellow(
        `⚠ Could not build the deprecated-features table: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return '';
  }

  if (deprecations.length === 0) {
    return '## Deprecated Features\n\nThere are no deprecated features in the current version.\n\n';
  }

  const rows: string = deprecations
    .map((entry: RegisteredDeprecation): string => {
      const removeBy: string = Deprecations.resolveRemoveBy(entry.deprecation);
      const replacement: string = entry.deprecation.replacement ? `\`${entry.deprecation.replacement}\`` : '—';
      const scope: string[] | undefined = Deprecations.commandScope(entry.deprecation);
      // A flag deprecated only for certain commands stays supported everywhere else — say so in the table.
      const feature: string = scope
        ? `\`${entry.feature}\` (only for ${scope.map((command: string): string => `\`${command}\``).join(', ')})`
        : `\`${entry.feature}\``;
      return `| ${feature} | ${entry.kind} | v${entry.deprecation.since} | v${removeBy} | ${replacement} |`;
    })
    .join('\n');

  return `## Deprecated Features

Deprecated flags are also marked inline in the help output below as \`[deprecated]\`, and deprecated commands as \`[DEPRECATED: ...]\`. The version window and replacement for each are listed in the table.

| Feature | Type | Deprecated since | Planned removal | Replacement |
| ------- | ---- | ---------------- | --------------- | ----------- |
${rows}

`;
}

function generateMarkdown(soloCommand: SoloCommand): string {
  let markdown: string = `## Overview

This page is the canonical command reference for the Solo CLI.

- Use it to look up command paths, subcommands, and flags.
- Use \`solo <command> --help\` and \`solo <command> <subcommand> --help\` for runtime help on your installed version.
- For legacy command mappings, see [CLI Migration Reference](/docs/advanced-solo-setup/cli/cli-migrations).

## Output Formats (\`--output\`, \`-o\`)

Solo supports machine-readable output for version output and for command execution flows that honor the output format flag.

\`\`\`text
solo --version -o json
solo --version -o yaml
solo --version -o wide
\`\`\`

Expected formats:

- \`json\`: JSON object output.
- \`yaml\`: YAML output.
- \`wide\`: plain text value-oriented output.

## Global Flags

Global flags shown in root help:

- \`--dev\`: enable developer mode.
- \`--force-port-forward\`: force port forwarding for network services.
- \`-v\`, \`--version\`: print Solo version.

${renderDeprecatedFeaturesSection()}## Command and Flag Reference

The sections below are generated from Solo CLI help output using the implementation on \`hiero-ledger/solo\`.

## Version Output

${getPreparedOutput(soloCommand.versionOutput)}

## Root Help Output

`;

  markdown += getPreparedOutput(soloCommand.output);

  for (const topLevelCommand of soloCommand.topLevelCommands) {
    markdown += `\n\n## ${topLevelCommand.topCommand}\n\n`;
    markdown += getPreparedOutput(topLevelCommand.output);

    for (const secondLevelCommand of topLevelCommand.secondLevelCommands) {
      markdown += `\n\n### ${secondLevelCommand.parent.topCommand} ${secondLevelCommand.secondCommand}\n\n`;
      markdown += getPreparedOutput(secondLevelCommand.output);

      for (const thirdLevelCommand of secondLevelCommand.thirdLevelCommands) {
        markdown += `\n\n#### ${thirdLevelCommand.parent.parent.topCommand} ${thirdLevelCommand.parent.secondCommand} ${thirdLevelCommand.thirdCommand}\n\n`;
        markdown += getPreparedOutput(thirdLevelCommand.output);
      }
    }
  }

  return markdown;
}

function getPreparedOutput(output: string): string {
  return `\`\`\`\n${output}\n\`\`\``;
}

async function generateHelp(): Promise<void> {
  const soloCommand: SoloCommand = await getTopLevelCommands();

  await Promise.all(
    soloCommand.topLevelCommands.map(async (topLevelCommand): Promise<void> => {
      await getSecondLevelCommands(topLevelCommand);
      await Promise.all(
        topLevelCommand.secondLevelCommands.map(async (secondLevelCommand): Promise<void> => {
          await getThirdLevelCommands(secondLevelCommand);
          await Promise.all(
            secondLevelCommand.thirdLevelCommands.map(async (thirdLevelCommand): Promise<void> => {
              await getOutputForThirdLevelCommand(thirdLevelCommand);
            }),
          );
        }),
      );
    }),
  );

  const fileContents: string = generateMarkdown(soloCommand);

  // Write all at once
  fs.writeFileSync(OUTPUT_FILE, fileContents, 'utf8');

  console.log(`Documentation saved to ${OUTPUT_FILE}`);
}

function main(): void {
  generateHelp().catch((error: unknown): never => {
    console.error(chalk.red('❌ An error occurred while generating help documentation:'), error);
    // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
    process.exit(1);
  });
}
main();
