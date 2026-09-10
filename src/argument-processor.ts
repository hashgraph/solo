// SPDX-License-Identifier: Apache-2.0

import {SilentBreak} from './core/errors/silent-break.js';
import {Flags as flags} from './commands/flags.js';
import {type Middlewares} from './core/middlewares.js';
import {InjectTokens} from './core/dependency-injection/inject-tokens.js';
import {type HelpRenderer} from './core/help-renderer.js';
import {container} from 'tsyringe-neo';
import {type SoloLogger} from './core/logging/solo-logger.js';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import {type AnyObject} from './types/aliases.js';

export class ArgumentProcessor {
  public static async process(argv: string[]): Promise<AnyObject> {
    const logger: SoloLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);
    const middlewares: Middlewares = container.resolve(InjectTokens.Middlewares);
    const helpRenderer: HelpRenderer = container.resolve(InjectTokens.HelpRenderer);
    const commands: AnyObject = container.resolve(InjectTokens.Commands);
    const rawArguments: string[] = hideBin(argv);

    logger.debug('Initializing commands');
    const rootCmd: AnyObject = yargs(rawArguments)
      .scriptName('')
      .usage('Usage:\n  solo <command> [options]')
      .alias('h', 'help')
      .alias('v', 'version')
      .help(false) // disable default help to enable custom help renderer
      .command(commands.getCommandDefinitions())
      .strict()
      .demand(1, 'Select a command');

    rootCmd.middleware(
      [
        middlewares.detectLocalSoloPackages(),
        middlewares.printCustomHelp(rootCmd),
        middlewares.warnDeprecatedFlags(),
        middlewares.warnDeprecatedCommands(),
        middlewares.setLoggerDebugFlag(),
        // @ts-expect-error - TS2322: To assign middlewares
        middlewares.processArgumentsAndDisplayHeader(),
        middlewares.initSystemFiles(),
      ],
      false, // applyBeforeValidate is false as otherwise middleware is called twice
    );

    // Expand the terminal width to the maximum available
    rootCmd.wrap(rootCmd.terminalWidth());

    rootCmd.fail((message): void => {
      if (message) {
        const usedHelpShorthand: boolean =
          rawArguments.includes('help') && !rawArguments.includes('--help') && !rawArguments.includes('-h');
        const usedHelpFlag: boolean = rawArguments.includes('--help') || rawArguments.includes('-h');

        if (usedHelpShorthand || usedHelpFlag) {
          rootCmd.showHelp((output): void => {
            helpRenderer.render(rootCmd, output);
          });
          throw new SilentBreak('Help displayed');
        }

        if (message.toLowerCase().includes('select')) {
          // Show what subcommands are available then exit normally
          rootCmd.showHelp((output): void => {
            helpRenderer.render(rootCmd, output);
          });
          // Use SilentBreak to exit cleanly without error display
          throw new SilentBreak('No subcommand provided, help displayed');
        }

        // Any other yargs failure is a CLI usage error: show it with the usage help, without an internal error report
        logger.showUser(message);
        rootCmd.showHelp((output): void => {
          helpRenderer.render(rootCmd, output);
        });

        // Throw to propagate through async call chains when given an invalid argument
        if (!rootCmd.parsed.argv.help) {
          // Set exit code but don't exit immediately - allows I/O buffers to flush
          process.exitCode = 1;
          throw new SilentBreak(message);
        }
      }
    });

    logger.debug('Setting up flags');
    // set root level flags
    flags.setOptionalCommandFlags(rootCmd, [flags.debugMode, flags.forcePortForward]);
    logger.debug('Parsing root command (executing the commands)');
    return await rootCmd.parseAsync();
  }
}
