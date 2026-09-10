// SPDX-License-Identifier: Apache-2.0

import {BaseCommandTest} from './base-command-test.js';
import {type ClusterReferenceName, type DeploymentName} from '../../../../src/types/index.js';
import {Flags} from '../../../../src/commands/flags.js';
import {main} from '../../../../src/index.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {type NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {type BaseTestOptions} from './base-test-options.js';
import {Templates} from '../../../../src/core/templates.js';
import {RelayCommandDefinition} from '../../../../src/commands/command-definitions/relay-command-definition.js';
import {type NodeAlias} from '../../../../src/types/aliases.js';

export class RelayTest extends BaseCommandTest {
  private static soloRelayDeployArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    nodeAliasesUnparsed: string,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = RelayTest;

    const argv: string[] = newArgv();
    argv.push(
      RelayCommandDefinition.COMMAND_NAME,
      RelayCommandDefinition.NODE_SUBCOMMAND_NAME,
      RelayCommandDefinition.NODE_ADD,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.nodeAliasesUnparsed),
      nodeAliasesUnparsed,
    );
    argvPushGlobalFlags(argv, testName, true, false);
    return argv;
  }

  private static soloRelayDestroyArgv(
    testName: string,
    deployment: DeploymentName,
    clusterReference: ClusterReferenceName,
    nodeAliasesUnparsed: string,
  ): string[] {
    const {newArgv, argvPushGlobalFlags, optionFromFlag} = RelayTest;

    const argv: string[] = newArgv();
    argv.push(
      RelayCommandDefinition.COMMAND_NAME,
      RelayCommandDefinition.NODE_SUBCOMMAND_NAME,
      RelayCommandDefinition.NODE_DESTROY,
      optionFromFlag(Flags.deployment),
      deployment,
      optionFromFlag(Flags.clusterRef),
      clusterReference,
      optionFromFlag(Flags.nodeAliasesUnparsed),
      nodeAliasesUnparsed,
      optionFromFlag(Flags.quiet),
      optionFromFlag(Flags.debugMode),
    );
    argvPushGlobalFlags(argv, testName, false, true);
    return argv;
  }

  private static getNodeAliasesUnparsed(consensusNodesCount: number): string {
    return Array.from({length: consensusNodesCount}, (_, index): NodeAlias => `node${index + 1}` as NodeAlias).join(
      ',',
    );
  }

  private static async verifyRelayDeployWasSuccessful(contexts: string[], namespace: NamespaceName): Promise<void> {
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    const relayPods: Pod[] = await k8Factory.getK8(contexts[1]).pods().list(namespace, Templates.renderRelayLabels(1));

    expect(relayPods).to.have.lengthOf(1);
  }

  public static add(options: BaseTestOptions): void {
    const {testName, deployment, namespace, contexts, clusterReferenceNameArray, consensusNodesCount} = options;
    const {soloRelayDeployArgv, verifyRelayDeployWasSuccessful, getNodeAliasesUnparsed} = RelayTest;
    const nodeAliasesUnparsed: string = getNodeAliasesUnparsed(consensusNodesCount);

    // TODO: Investigate validations
    it(`${testName}: JSON-RPC relay node add`, async (): Promise<void> => {
      await main(soloRelayDeployArgv(testName, deployment, clusterReferenceNameArray[1], nodeAliasesUnparsed));
      await verifyRelayDeployWasSuccessful(contexts, namespace);
    }).timeout(Duration.ofMinutes(5).toMillis());
  }

  public static destroy(options: BaseTestOptions): void {
    const {testName, deployment, clusterReferenceNameArray, consensusNodesCount} = options;
    const {soloRelayDestroyArgv, getNodeAliasesUnparsed} = RelayTest;
    const nodeAliasesUnparsed: string = getNodeAliasesUnparsed(consensusNodesCount);

    it(`${testName}: JSON-RPC relay node destroy`, async (): Promise<void> => {
      await main(soloRelayDestroyArgv(testName, deployment, clusterReferenceNameArray[1], nodeAliasesUnparsed));
    }).timeout(Duration.ofMinutes(5).toMillis());
  }
}
