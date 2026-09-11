// SPDX-License-Identifier: Apache-2.0

import {type CommandFlag} from '../../../../src/types/flag-types.js';
import {Flags} from '../../../../src/commands/flags.js';
import {getTestCacheDirectory} from '../../../test-utility.js';
import {type BaseTestOptions} from './base-test-options.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type NodeCommand} from '../../../../src/commands/node/index.js';
import {DeploymentCommandDefinition} from '../../../../src/commands/command-definitions/deployment-command-definition.js';
import {Argv} from '../../../helpers/argv-wrapper.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {getEnvironmentVariable} from '../../../../src/core/constants.js';
import {ConsensusCommandDefinition} from '../../../../src/commands/command-definitions/consensus-command-definition.js';
import {BlockCommandDefinition} from '../../../../src/commands/command-definitions/block-command-definition.js';
import type BlockNodeCommand from '../../../../src/commands/block-node.js';
import {MirrorCommandDefinition} from '../../../../src/commands/command-definitions/mirror-command-definition.js';
import {type MirrorNodeCommand} from '../../../../src/commands/mirror-node.js';
import {Templates} from '../../../../src/core/templates.js';
import {type NodeAlias} from '../../../../src/types/aliases.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {main} from '../../../../src/index.js';
import fs from 'node:fs';

export class BaseCommandTest {
  public static newArgv(): string[] {
    return ['${PATH}/node', '${SOLO_ROOT}/solo.ts'];
  }

  public static optionFromFlag(flag: CommandFlag): string {
    return `--${flag.name}`;
  }

  public static argvPushGlobalFlags(
    argv: string[],
    testName: string,
    shouldSetTestCacheDirectory: boolean = false,
    shouldSetChartDirectory: boolean = false,
  ): string[] {
    argv.push(BaseCommandTest.optionFromFlag(Flags.debugMode), BaseCommandTest.optionFromFlag(Flags.quiet));

    const soloChartsDirectory: string = getEnvironmentVariable('SOLO_CHARTS_DIR');
    if (shouldSetChartDirectory && soloChartsDirectory && soloChartsDirectory !== '') {
      argv.push(BaseCommandTest.optionFromFlag(Flags.chartDirectory), process.env.SOLO_CHARTS_DIR);
    }

    if (shouldSetTestCacheDirectory) {
      argv.push(BaseCommandTest.optionFromFlag(Flags.cacheDir), getTestCacheDirectory(testName));
    }

    return argv;
  }

  /**
   * Collects diagnostic logs using the deployment diagnostics command.
   * This is a shared helper used by both test patterns.
   */
  public static async collectDiagnosticLogs(
    testName: string,
    testLogger: SoloLogger,
    deployment: string,
  ): Promise<void> {
    try {
      testLogger.info(`${testName}: Collecting diagnostic logs...`);

      // Create proper Argv object
      const argv: Argv = Argv.getDefaultArgv(NamespaceName.of(testName), testName);
      argv.setArg(Flags.deployment, deployment);
      argv.setCommand(
        DeploymentCommandDefinition.COMMAND_NAME,
        DeploymentCommandDefinition.DIAGNOSTICS_SUBCOMMAND_NAME,
        DeploymentCommandDefinition.DIAGNOSTICS_LOGS,
      );

      const nodeCmd: NodeCommand = container.resolve<NodeCommand>(InjectTokens.NodeCommand);
      await nodeCmd.handlers.logs(argv.build());

      testLogger.info(`${testName}: Diagnostic logs collected successfully`);
    } catch (error: unknown) {
      testLogger.error(`${testName}: Error collecting diagnostic logs: ${error}`);
      if (error instanceof Error && error.stack) {
        testLogger.error(`${testName}: Stack trace:\n${error.stack}`);
      }
    }
  }

  public static async collectJavaFlightRecorderLogs(
    testName: string,
    testLogger: SoloLogger,
    deployment: string,
    nodeAlias: string,
  ): Promise<void> {
    try {
      testLogger.info(`${testName}: Collecting jfr logs...`);

      // Create proper Argv object
      const argv: Argv = Argv.getDefaultArgv(NamespaceName.of(testName), testName);
      argv.setArg(Flags.deployment, deployment);
      argv.setArg(Flags.nodeAlias, nodeAlias);
      argv.setCommand(
        ConsensusCommandDefinition.COMMAND_NAME,
        ConsensusCommandDefinition.NODE_SUBCOMMAND_NAME,
        ConsensusCommandDefinition.COLLECT_JFR,
      );

      const nodeCmd: NodeCommand = container.resolve<NodeCommand>(InjectTokens.NodeCommand);
      await nodeCmd.handlers.collectJavaFlightRecorderLogs(argv.build());

      testLogger.info(`${testName}: Java Flight Recorder logs for node ${nodeAlias} collected successfully`);
    } catch (error: unknown) {
      testLogger.error(`${testName}: Error collecting Java Flight Recorder logs for node  ${nodeAlias}: ${error}`);
      if (error instanceof Error && error.stack) {
        testLogger.error(`${testName}: Stack trace:\n${error.stack}`);
      }
    }
  }

  public static async collectBlockNodeJavaFlightRecorderLogs(
    testName: string,
    testLogger: SoloLogger,
    deployment: string,
  ): Promise<void> {
    try {
      testLogger.info(`${testName}: Collecting block node jfr logs...`);

      const argv: Argv = Argv.getDefaultArgv(NamespaceName.of(testName), testName);
      argv.setArg(Flags.deployment, deployment);
      argv.setCommand(
        BlockCommandDefinition.COMMAND_NAME,
        BlockCommandDefinition.NODE_SUBCOMMAND_NAME,
        BlockCommandDefinition.NODE_COLLECT_JFR,
      );

      const blockNodeCommand: BlockNodeCommand = container.resolve<BlockNodeCommand>(InjectTokens.BlockNodeCommand);
      await blockNodeCommand.collectJfr(argv.build());

      testLogger.info(`${testName}: Block node Java Flight Recorder logs collected successfully`);
    } catch (error: unknown) {
      // Best-effort: a run without a JFR-enabled block node should not fail teardown.
      testLogger.error(`${testName}: Error collecting block node Java Flight Recorder logs: ${error}`);
      if (error instanceof Error && error.stack) {
        testLogger.error(`${testName}: Stack trace:\n${error.stack}`);
      }
    }
  }

  public static async collectMirrorNodeJavaFlightRecorderLogs(
    testName: string,
    testLogger: SoloLogger,
    deployment: string,
  ): Promise<void> {
    try {
      testLogger.info(`${testName}: Collecting mirror node jfr logs...`);

      const argv: Argv = Argv.getDefaultArgv(NamespaceName.of(testName), testName);
      argv.setArg(Flags.deployment, deployment);
      argv.setCommand(
        MirrorCommandDefinition.COMMAND_NAME,
        MirrorCommandDefinition.NODE_SUBCOMMAND_NAME,
        MirrorCommandDefinition.NODE_COLLECT_JFR,
      );

      const mirrorNodeCommand: MirrorNodeCommand = container.resolve<MirrorNodeCommand>(InjectTokens.MirrorNodeCommand);
      await mirrorNodeCommand.collectJfr(argv.build());

      testLogger.info(`${testName}: Mirror node Java Flight Recorder logs collected successfully`);
    } catch (error: unknown) {
      // A run without a JFR-enabled mirror node (or a recording still shorter than one chunk) is handled
      // inside collectJfr as a non-throwing task.skip(), so any error reaching here is a genuine collection
      // failure. Surface it instead of swallowing it, otherwise the opted-in performance test passes silently.
      testLogger.error(`${testName}: Error collecting mirror node Java Flight Recorder logs: ${error}`);
      if (error instanceof Error && error.stack) {
        testLogger.error(`${testName}: Stack trace:\n${error.stack}`);
      }
      throw error;
    }
  }

  /**
   * Sets up an after() hook for diagnostic log collection in E2E tests.
   * Call this within your test suite describe block.
   */
  public static async setupDiagnosticLogCollection(options: BaseTestOptions): Promise<void> {
    const {testName, testLogger, deployment} = options;
    await BaseCommandTest.collectDiagnosticLogs(testName, testLogger, deployment);
  }

  /**
   * Sets up an after() hook for diagnostic log collection in E2E tests.
   * Call this within your test suite describe block.
   */
  public static async setupJavaFlightRecorderLogCollection(options: BaseTestOptions): Promise<void> {
    const {testName, testLogger, deployment} = options;
    const promises: Promise<void>[] = [];
    for (let index: number = 0; index < options.consensusNodesCount; index++) {
      const nodeAlias: NodeAlias = Templates.renderNodeAliasFromNumber(index + 1);
      promises.push(BaseCommandTest.collectJavaFlightRecorderLogs(testName, testLogger, deployment, nodeAlias));
    }
    await Promise.all(promises);

    if (process.env.PERFORMANCE_TEST_WITH_BLOCK_NODE === 'true') {
      await BaseCommandTest.collectBlockNodeJavaFlightRecorderLogs(testName, testLogger, deployment);
    }

    if (process.env.PERFORMANCE_TEST_WITH_MIRROR_NODE_JFR === 'true') {
      await BaseCommandTest.collectMirrorNodeJavaFlightRecorderLogs(testName, testLogger, deployment);
    }
  }

  public static async runMainAndCaptureOutputToJson(
    argv: string[],
    options: {
      testName: string;
      outputFileName: string;
      metadata?: Record<string, unknown>;
      outputSubdirectory?: string;
    },
  ): Promise<{stdout: string; stderr: string; outputFilePath: string}> {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const outputSubdirectory: string = options.outputSubdirectory ?? 'command-output';

    const originalStdoutWrite: typeof process.stdout.write = process.stdout.write.bind(process.stdout);
    const originalStderrWrite: typeof process.stderr.write = process.stderr.write.bind(process.stderr);

    process.stdout.write = ((
      chunk: string | Uint8Array,
      encoding?: BufferEncoding,
      callback?: (error?: Error) => void,
    ): boolean => {
      stdoutChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(encoding));
      if (encoding === undefined) {
        return callback ? originalStdoutWrite(chunk, callback) : originalStdoutWrite(chunk);
      }
      return callback ? originalStdoutWrite(chunk, encoding, callback) : originalStdoutWrite(chunk, encoding);
    }) as typeof process.stdout.write;

    process.stderr.write = ((
      chunk: string | Uint8Array,
      encoding?: BufferEncoding,
      callback?: (error?: Error) => void,
    ): boolean => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(encoding));
      if (encoding === undefined) {
        return callback ? originalStderrWrite(chunk, callback) : originalStderrWrite(chunk);
      }
      return callback ? originalStderrWrite(chunk, encoding, callback) : originalStderrWrite(chunk, encoding);
    }) as typeof process.stderr.write;

    try {
      await main(argv);
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    const outputDirectory: string = PathEx.join(getTestCacheDirectory(options.testName), outputSubdirectory);
    fs.mkdirSync(outputDirectory, {recursive: true});

    const outputFilePath: string = PathEx.join(outputDirectory, options.outputFileName);
    const payload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      argv,
      stdout: stdoutChunks.join(''),
      stderr: stderrChunks.join(''),
      ...options.metadata,
    };

    fs.writeFileSync(outputFilePath, JSON.stringify(payload, undefined, 2), 'utf8');

    return {
      stdout: payload.stdout as string,
      stderr: payload.stderr as string,
      outputFilePath,
    };
  }
}
