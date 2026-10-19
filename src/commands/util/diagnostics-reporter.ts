// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import fs from 'node:fs';
import os from 'node:os';
import {spawnSync, type SpawnSyncReturns} from 'node:child_process';
import {confirm as confirmPrompt} from '@inquirer/prompts';
import {Listr} from 'listr2';
import {ShellRunner} from '../../core/shell-runner.js';
import {SubprocessEnvironment} from '../../core/subprocess-environment.js';
import {SubprocessCommandProfile} from '../../core/subprocess-command-profile.js';
import {SoloErrors} from '../../core/errors/solo-errors.js';
import {PathEx} from '../../business/utils/path-ex.js';
import * as constants from '../../core/constants.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type SoloListr} from '../../types/index.js';

/** Options for building a GitHub issue body from diagnostic information. */
export type DiagnosticsIssueBodyOptions = {
  soloVersion: string;
  deployment: string;
  timestamp: string;
  /** Directory where diagnostics-analysis.txt was written by DiagnosticsAnalyzer. */
  analysisDirectory: string;
  /** Absolute path to the debug zip archive, if one was created. */
  zipFilePath?: string;
};

export type DiagnosticsReportRunOptions = {
  logger: SoloLogger;
  deployment: string;
  outputDirectory: string;
  soloVersion: string;
  isQuiet: boolean;
  collectDebug: () => Promise<void>;
};

type DiagnosticsReportContext = {
  zipFilePath?: string;
  issueTitle?: string;
  issueBody?: string;
};

type FilePathModificationTime = {
  filePath: string;
  mtime: number;
};

/**
 * Utility class for the `deployment diagnostics report` command.
 * Handles gh CLI availability checks, issue body assembly, and issue creation.
 */
export class DiagnosticsReporter {
  /**
   * Orchestrates `deployment diagnostics report` flow:
   * 1) collect debug archive, 2) build issue payload, 3) optionally prompt, 4) create GitHub issue.
   */
  public static async runDiagnosticsReport(options: DiagnosticsReportRunOptions): Promise<void> {
    const {logger, deployment, outputDirectory, soloVersion, isQuiet, collectDebug} = options;

    // collectDebug() runs its own commandAction/Listr2 renderer internally.
    // It must be called at the top level — not inside a Listr2 task — to avoid
    // the "ProcessOutput has been already hijacked!" error from nested renderers.
    const zipSearchDirectory: string = PathEx.join(outputDirectory, '..');
    const startTime: number = Date.now();
    const analysisDirectory: string =
      outputDirectory === constants.SOLO_LOGS_DIR
        ? PathEx.join(constants.SOLO_LOGS_DIR, 'hiero-components-logs')
        : outputDirectory;

    await collectDebug();

    // Phase 1: verify CLI + build payload (no interactive prompts — Listr2 owns the terminal here)
    const context: DiagnosticsReportContext = {};

    const prepareTasks: SoloListr<DiagnosticsReportContext> = new Listr(
      [
        {
          title: 'Verify GitHub CLI availability',
          task: async (_context_): Promise<void> => {
            if (!(await DiagnosticsReporter.isGhCliAvailable(logger))) {
              throw new SoloErrors.system.dependencyNotFound('gh (GitHub CLI)');
            }
          },
        },
        {
          title: 'Prepare GitHub issue payload',
          task: async (context_): Promise<void> => {
            context_.zipFilePath = DiagnosticsReporter.findLatestDebugZip(zipSearchDirectory, deployment, startTime);
            const timestamp: string = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
            context_.issueTitle = `[Solo v${soloVersion}] Diagnostic Report - ${deployment} - ${timestamp}`;
            context_.issueBody = DiagnosticsReporter.buildIssueBody({
              soloVersion,
              deployment,
              timestamp,
              analysisDirectory,
              zipFilePath: context_.zipFilePath,
            });
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    await prepareTasks.run(context);

    // Phase 2: interactive confirmation — must run OUTSIDE Listr2 so the prompt
    // can render normally (Listr2 hijacks the terminal while it is running).
    if (!isQuiet) {
      logger.showUser(chalk.cyan('\nReady to create a GitHub issue with the collected diagnostic information.'));
      logger.showUser(chalk.cyan(`  Issue title: ${context.issueTitle}`));
      if (context.zipFilePath) {
        logger.showUser(chalk.cyan(`  Debug archive: ${context.zipFilePath}`));
      }
      logger.showUser(
        chalk.red.bold(
          '\n⚠  Warning: The collected diagnostic archive may contain sensitive node configuration\n' +
            '   (TLS certificates, onboard data). Review its contents before sharing publicly.\n' +
            '   Private keys under data/keys are NOT included.',
        ),
      );

      const confirmed: boolean = await confirmPrompt({
        message: 'Create a GitHub issue with the diagnostic information?',
        default: true,
      });

      if (!confirmed) {
        logger.showUser(chalk.yellow('\nIssue creation cancelled.'));
        logger.showUser(chalk.cyan(`Diagnostic logs are available at: ${analysisDirectory}`));
        if (context.zipFilePath) {
          logger.showUser(chalk.cyan(`Debug archive: ${context.zipFilePath}`));
        }
        return;
      }
    }

    // Phase 3: create the issue (Listr2 again for progress display)
    const createTasks: SoloListr<DiagnosticsReportContext> = new Listr(
      [
        {
          title: 'Create GitHub issue',
          task: async (context_): Promise<void> => {
            await DiagnosticsReporter.createGitHubIssue(
              logger,
              context_.issueTitle ?? '',
              context_.issueBody ?? '',
              analysisDirectory,
              context_.zipFilePath,
            );
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    await createTasks.run(context);
  }

  /**
   * Checks whether the GitHub CLI (`gh`) is available on the system PATH.
   * @returns true if `gh` is installed and reachable, false otherwise
   */
  public static async isGhCliAvailable(logger: SoloLogger): Promise<boolean> {
    try {
      const shellRunner: ShellRunner = new ShellRunner(logger);
      const command: string = os.platform() === 'win32' ? 'where' : 'which';
      await shellRunner.run(command, ['gh']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Searches for the most recently modified debug zip archive that was created
   * at or after `afterTimestampMs` in the given directory.
   *
   * The `deployment diagnostics debug` command writes files named
   * `solo-debug-<deployment>-<timestamp>.zip` one level above the logs directory.
   *
   * @param searchDirectory  Directory to search (typically `~/.solo`).
   * @param deployment       Deployment name used as part of the filename prefix.
   * @param afterTimestampMs Milliseconds epoch; only files modified at or after
   *                         this time are considered.
   * @returns The absolute path to the found zip, or `undefined` if none matched.
   */
  public static findLatestDebugZip(
    searchDirectory: string,
    deployment: string,
    afterTimestampMs: number,
  ): string | undefined {
    if (!fs.existsSync(searchDirectory)) {
      return undefined;
    }

    const prefix: string = `solo-debug-${deployment}-`;
    const candidates: FilePathModificationTime[] = fs
      .readdirSync(searchDirectory)
      .filter((file: string): boolean => file.startsWith(prefix) && file.endsWith('.zip'))
      .map((file: string): FilePathModificationTime => {
        const filePath: string = PathEx.join(searchDirectory, file);
        const mtime: number = fs.statSync(filePath).mtimeMs;
        return {filePath, mtime};
      })
      .filter(({mtime}: FilePathModificationTime): boolean => mtime >= afterTimestampMs)
      // eslint-disable-next-line unicorn/no-array-sort
      .sort((a: FilePathModificationTime, b: FilePathModificationTime): number => b.mtime - a.mtime);

    return candidates.length > 0 ? candidates[0].filePath : undefined;
  }

  /**
   * Reads the diagnostics-analysis.txt file from the logs directory, if present.
   * @param logsDirectory  Directory where the analysis file is expected.
   * @returns File contents, or an empty string if the file does not exist.
   */
  public static readAnalysisContent(logsDirectory: string): string {
    const analysisFilePath: string = PathEx.join(logsDirectory, 'diagnostics-analysis.txt');
    if (fs.existsSync(analysisFilePath)) {
      return fs.readFileSync(analysisFilePath, 'utf8');
    }
    return '';
  }

  /**
   * Assembles the Markdown body for a GitHub issue from the provided diagnostic
   * information.
   */
  public static buildIssueBody(options: DiagnosticsIssueBodyOptions): string {
    const {soloVersion, deployment, timestamp, analysisDirectory, zipFilePath} = options;
    const analysisContent: string = DiagnosticsReporter.readAnalysisContent(analysisDirectory);

    const lines: string[] = [
      '## Solo Diagnostic Report',
      '',
      `- **Solo Version**: ${soloVersion}`,
      `- **Deployment**: ${deployment || '(not specified)'}`,
      `- **Timestamp**: ${timestamp}`,
      `- **Platform**: ${os.platform()} ${os.release()}`,
      `- **Node.js**: ${process.version}`,
      `- **Diagnostic logs**: ${analysisDirectory}`,
    ];

    if (zipFilePath) {
      lines.push(`- **Debug archive**: ${zipFilePath}`);
    }

    lines.push(
      '',
      '## Diagnostics Analysis',
      '',
      analysisContent ? '```\n' + analysisContent + '\n```' : '_No analysis available_',
      '',
      '## Description',
      '',
      '_Please describe the issue you encountered..._',
      '',
      '## Steps to Reproduce',
      '',
      '_Please list the steps to reproduce the issue..._',
    );

    if (zipFilePath) {
      lines.push(
        '',
        '---',
        `_Note: A debug archive was generated at \`${zipFilePath}\`. Please attach it to this issue via the GitHub web interface._`,
      );
    }

    return lines.join('\n');
  }

  /**
   * Executes `gh issue create` with the provided args using `spawnSync` (without a shell)
   * so that space-containing arguments such as the issue title are passed verbatim.
   *
   * Extracted as a public static method so that unit tests can stub it without invoking
   * the real `gh` CLI.
   *
   * @param arguments_  Arguments to pass to the `gh` CLI.
   * @returns           The `SpawnSyncReturns` result from the `gh` process.
   */
  public static executeGhCommand(arguments_: string[]): SpawnSyncReturns<string> {
    return spawnSync('gh', arguments_, {
      shell: false,
      encoding: 'utf8',
      env: SubprocessEnvironment.forCommand(SubprocessCommandProfile.GITHUB_CLI),
    });
  }

  /**
   * Creates a GitHub issue using the `gh` CLI with the supplied title and body.
   * If a zip archive path is provided, the user is reminded to attach it manually
   * since the GitHub Issues API does not support binary attachments.
   *
   * @param logger       Logger for user-facing output.
   * @param title        Issue title.
   * @param body         Issue body in Markdown.
   * @param analysisDirectory
   * @param zipFilePath  Optional path to the debug zip archive to mention.
   * @returns The URL of the newly created issue, or an empty string if not found.
   */
  public static async createGitHubIssue(
    logger: SoloLogger,
    title: string,
    body: string,
    analysisDirectory: string,
    zipFilePath?: string,
  ): Promise<string> {
    // Write body to a temp file to avoid any shell interpretation of the markdown content.
    // spawnSync without a shell passes the title and all other args verbatim and returns the
    // exit status synchronously — ShellRunner (also shell-less since #4804) is async and
    // throws on a non-zero exit, which this flow inspects instead.
    const bodyFilePath: string = PathEx.join(os.tmpdir(), `solo-gh-issue-body-${Date.now()}.md`);
    fs.writeFileSync(bodyFilePath, body, 'utf8');
    try {
      const result: SpawnSyncReturns<string> = DiagnosticsReporter.executeGhCommand([
        'issue',
        'create',
        '--repo',
        'hiero-ledger/solo',
        '--title',
        title,
        '--body-file',
        bodyFilePath,
      ]);

      if (result.status !== 0) {
        throw new Error(result.stderr?.trim() || `gh exited with status ${result.status}`);
      }

      const issueUrl: string =
        result.stdout.split('\n').find((line: string): boolean => line.startsWith('https://')) ?? '';

      logger.showUser(chalk.green('\n✓ GitHub issue created successfully!'));
      if (issueUrl) {
        logger.showUser(chalk.cyan(`  Issue URL: ${issueUrl}`));
      }
      logger.showUser(chalk.cyan(`  Diagnostic logs: ${analysisDirectory}`));

      if (zipFilePath && fs.existsSync(zipFilePath)) {
        logger.showUser(chalk.cyan(`  Debug archive: ${zipFilePath}`));
        logger.showUser('');
        logger.showUser(chalk.bgYellow.black.bold(' ACTION REQUIRED '));
        logger.showUser(
          chalk.yellow.bold(
            '  ⚠  Please attach the debug archive to the GitHub issue:\n' +
              `     ${zipFilePath}\n` +
              '  Go to the issue URL above → click "attach files" → upload the zip.',
          ),
        );
      }

      return issueUrl;
    } catch (error: Error | unknown) {
      throw new SoloErrors.system.githubApiRequestFailed('https://api.github.com', error as Error);
    } finally {
      fs.rmSync(bodyFilePath, {force: true});
    }
  }
}
