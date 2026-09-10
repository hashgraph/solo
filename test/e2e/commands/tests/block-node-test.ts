// SPDX-License-Identifier: Apache-2.0

import {main} from '../../../../src/index.js';
import {Flags} from '../../../../src/commands/flags.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {BaseCommandTest} from './base-command-test.js';
import {BlockCommandDefinition} from '../../../../src/commands/command-definitions/block-command-definition.js';
import {type BaseTestOptions} from './base-test-options.js';
import {type ClusterReferenceName, type ComponentId, type DeploymentName} from '../../../../src/types/index.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import * as constants from '../../../../src/core/constants.js';
import {expect} from 'chai';
import {exec, type ExecException, type ExecOptionsWithStringEncoding} from 'node:child_process';
import {promisify} from 'node:util';
import {type NodeAlias, type NodeAliases} from '../../../../src/types/aliases.js';
import {HEDERA_HAPI_PATH} from '../../../../src/core/constants.js';
import {type Container} from '../../../../src/integration/kube/resources/container/container.js';
import {K8Helper} from '../../../../src/business/utils/k8-helper.js';
import {sleep} from '../../../../src/core/helpers.js';
import {OperatingSystem} from '../../../../src/business/utils/operating-system.js';

export class BlockNodeTest extends BaseCommandTest {
  private static soloBlockNodeDeployArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    enableLocalBuildPathTesting: boolean,
    localBuildReleaseTag: string,
    nodeAliases?: NodeAliases,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = BlockNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      BlockCommandDefinition.COMMAND_NAME,
      BlockCommandDefinition.NODE_SUBCOMMAND_NAME,
      BlockCommandDefinition.NODE_ADD,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      // E2E tests add block nodes before network deploy persists tssEnabled.
      // Force matching block-node limits for CN >= 0.74 block streaming.
      optionFromFlag(Flags.blockNodeTssOverlay),
    );

    if (enableLocalBuildPathTesting) {
      argv.push(optionFromFlag(Flags.releaseTag), localBuildReleaseTag);
    }

    if (nodeAliases !== undefined && nodeAliases.length > 0) {
      const stringBuilder: string[] = [];

      for (const nodeAlias of nodeAliases) {
        stringBuilder.push(`${nodeAlias}=1`);
      }

      argv.push(optionFromFlag(Flags.priorityMapping), stringBuilder.join(','));
    }

    argvPushGlobalFlags(argv, testName, true, true);
    return argv;
  }

  private static soloBlockNodeAddExternalArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    address: string,
    nodeAliases?: NodeAliases,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = BlockNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      BlockCommandDefinition.COMMAND_NAME,
      BlockCommandDefinition.NODE_SUBCOMMAND_NAME,
      BlockCommandDefinition.NODE_ADD_EXTERNAL,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.externalBlockNodeAddress),
      address,
    );

    if (nodeAliases !== undefined && nodeAliases.length > 0) {
      const stringBuilder: string[] = [];

      for (const nodeAlias of nodeAliases) {
        stringBuilder.push(`${nodeAlias}=1`);
      }

      argv.push(optionFromFlag(Flags.priorityMapping), stringBuilder.join(','));
    }

    argvPushGlobalFlags(argv, testName, false, true);
    return argv;
  }

  private static soloBlockNodeDestroyArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = BlockNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      BlockCommandDefinition.COMMAND_NAME,
      BlockCommandDefinition.NODE_SUBCOMMAND_NAME,
      BlockCommandDefinition.NODE_DESTROY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.force),
      optionFromFlag(Flags.quiet),
      optionFromFlag(Flags.debugMode),
    );

    argvPushGlobalFlags(argv, testName, false, true);
    return argv;
  }

  private static soloBlockNodeDeleteExternalArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    id?: number,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = BlockNodeTest;

    const argv: string[] = newArgv();
    argv.push(
      BlockCommandDefinition.COMMAND_NAME,
      BlockCommandDefinition.NODE_SUBCOMMAND_NAME,
      BlockCommandDefinition.NODE_DELETE_EXTERNAL,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.force),
      optionFromFlag(Flags.quiet),
      optionFromFlag(Flags.debugMode),
    );

    if (id !== undefined) {
      argv.push(optionFromFlag(Flags.id), id.toString());
    }

    argvPushGlobalFlags(argv, testName);
    return argv;
  }

  public static add(options: BaseTestOptions, nodeAliases?: NodeAliases, clusterIndex: number = 0): void {
    const {testName, deployment, clusterReferenceNameArray, localBuildReleaseTag, enableLocalBuildPathTesting} =
      options;
    const {soloBlockNodeDeployArgv} = BlockNodeTest;
    const clusterReference: string = clusterReferenceNameArray[clusterIndex];

    it(`${testName}: block node add on ${clusterReference}`, async (): Promise<void> => {
      await main(
        soloBlockNodeDeployArgv(
          testName,
          deployment,
          clusterReference,
          enableLocalBuildPathTesting,
          localBuildReleaseTag,
          nodeAliases,
        ),
      );
      // Block node add can exceed 5 minutes on CI when image/chart pulls are slow.
    }).timeout(Duration.ofMinutes(10).toMillis());
  }

  public static addExternal(options: BaseTestOptions, address: string, nodeAliases?: NodeAliases): void {
    const {testName, deployment, clusterReferenceNameArray} = options;

    const {soloBlockNodeAddExternalArgv} = BlockNodeTest;

    it(`${testName}: block node add-external`, async (): Promise<void> => {
      await main(
        soloBlockNodeAddExternalArgv(testName, deployment, clusterReferenceNameArray[0], address, nodeAliases),
      );
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static deleteExternal(options: BaseTestOptions, id?: number): void {
    const {testName, deployment, clusterReferenceNameArray} = options;
    const {soloBlockNodeDeleteExternalArgv} = BlockNodeTest;
    const targetClusterReference: ClusterReferenceName = clusterReferenceNameArray[1] || clusterReferenceNameArray[0];

    it(`${testName}: block node delete-external`, async (): Promise<void> => {
      await main(soloBlockNodeDeleteExternalArgv(testName, deployment, targetClusterReference, id));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static destroy(options: BaseTestOptions): void {
    const {testName, deployment, clusterReferenceNameArray} = options;
    const {soloBlockNodeDestroyArgv} = BlockNodeTest;
    const targetClusterReference: ClusterReferenceName = clusterReferenceNameArray[1] || clusterReferenceNameArray[0];

    it(`${testName}: block node destroy`, async (): Promise<void> => {
      await main(soloBlockNodeDestroyArgv(testName, deployment, targetClusterReference));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static testBlockNode(options: BaseTestOptions, blockNodeId: number = 1): void {
    const {namespace, contexts, testName, testLogger} = options;

    const execAsync: (
      command: string,
      options?: ExecOptionsWithStringEncoding,
    ) => Promise<{stdout: string; stderr: string; error?: ExecException}> = promisify(exec);

    it(`${testName}: test block node connection for block node ${blockNodeId}`, async (): Promise<void> => {
      const pod: Pod = await new K8Helper(contexts[0]).getBlockNodePod(namespace, blockNodeId);

      const srv: number = await pod.portForward(constants.BLOCK_NODE_PORT, constants.BLOCK_NODE_PORT);

      // Sleep to allow the port-forward to be established before attempting to connect
      await sleep(Duration.ofSeconds(5));

      const commandOptions: ExecOptionsWithStringEncoding = {
        cwd: './test/data',
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'utf8',
      };

      // Make script executable (no-op on Windows; chmod is not available)
      if (!OperatingSystem.isWin32()) {
        await execAsync('chmod +x ./get-block.sh', commandOptions);
      }

      // Execute script (use bash explicitly on Windows since .sh files have no default handler)
      const scriptCommand: string = OperatingSystem.isWin32() ? 'bash ./get-block.sh 1' : './get-block.sh 1';
      const maximumAttempts: number = 60;
      let scriptStdout: string = '';
      let scriptStderr: string = '';
      let blockWasAvailable: boolean = false;

      for (let attempt: number = 1; attempt <= maximumAttempts; attempt++) {
        const scriptStd: {stdout: string; stderr: string} = await execAsync(scriptCommand, commandOptions);
        scriptStdout = scriptStd.stdout;
        scriptStderr = scriptStd.stderr;

        if (scriptStderr === '' && scriptStdout.includes('"status": "SUCCESS"')) {
          blockWasAvailable = true;
          break;
        }

        if (attempt < maximumAttempts) {
          testLogger.debug(
            `Block node ${blockNodeId} has not returned block 1 yet; attempt ${attempt}/${maximumAttempts}`,
          );
          await sleep(Duration.ofSeconds(2));
        }
      }

      expect(scriptStderr).to.equal('');
      expect(blockWasAvailable, `expected block node ${blockNodeId} to return block 1; last output: ${scriptStdout}`).to
        .be.true;

      await pod.stopPortForward(srv);
    }).timeout(Duration.ofMinutes(3).toMillis());
  }

  public static verifyBlockNodesJson(
    options: BaseTestOptions,
    nodeAlias: NodeAlias,
    blockNodeIds: ComponentId[],
    excludedBlockNodeIds: ComponentId[] = [],
    {
      expectedExternalAddress,
      expectedExternalPort,
      unexpectedExternalAddress,
      unexpectedExternalPort,
    }: {
      expectedExternalAddress?: string;
      expectedExternalPort?: number;
      unexpectedExternalAddress?: string;
      unexpectedExternalPort?: number;
    },
  ): void {
    const {namespace, contexts, testName} = options;

    it(`${testName}: verify block-nodes.json for ${nodeAlias}`, async (): Promise<void> => {
      const root: Container = await new K8Helper(contexts[0]).getConsensusNodeRootContainer(namespace, nodeAlias);

      const output: string = await root.execContainer([
        'bash',
        '-c',
        `cat ${HEDERA_HAPI_PATH}/data/config/block-nodes.json`,
      ]);

      for (const blockNodeId of blockNodeIds) {
        expect(output).to.include(`block-node-${blockNodeId}`);
      }

      for (const excludedBlockNodeId of excludedBlockNodeIds) {
        expect(output).to.not.include(`block-node-${excludedBlockNodeId}`);
      }

      if (expectedExternalAddress !== undefined) {
        expect(output).to.include(expectedExternalAddress);
      }

      if (expectedExternalPort !== undefined) {
        expect(output).to.include(expectedExternalPort.toString());
      }

      if (unexpectedExternalAddress !== undefined) {
        expect(output).not.to.include(unexpectedExternalAddress);
      }

      if (unexpectedExternalPort !== undefined) {
        expect(output).not.to.include(unexpectedExternalPort.toString());
      }
    });
  }
}
