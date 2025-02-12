/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {it, describe, after} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import * as constants from '../../../src/core/constants.js';
import {
  accountCreationShouldSucceed,
  balanceQueryShouldSucceed,
  e2eTestSuite,
  getDefaultArgv,
  getNodeAliasesPrivateKeysHash,
  getTmpDir,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../../test_util.js';
import {HEDERA_HAPI_PATH, ROOT_CONTAINER} from '../../../src/core/constants.js';
import fs from 'fs';
import {PodName} from '../../../src/core/kube/resources/pod/pod_name.js';
import * as NodeCommandConfigs from '../../../src/commands/node/configs.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {PodRef} from '../../../src/core/kube/resources/pod/pod_ref.js';
import {ContainerRef} from '../../../src/core/kube/resources/container/container_ref.js';
import {type NetworkNodes} from '../../../src/core/network_nodes.js';
import {container} from 'tsyringe-neo';
import {type V1Pod} from '@kubernetes/client-node';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';

const defaultTimeout = Duration.ofMinutes(2).toMillis();
const namespace = NamespaceName.of('node-update-separate');
const updateNodeId = 'node2';
const newAccountId = '0.0.7';
const argv = getDefaultArgv();
argv[flags.nodeAliasesUnparsed.name] = 'node1,node2,node3';
argv[flags.nodeAlias.name] = updateNodeId;

argv[flags.newAccountNumber.name] = newAccountId;
argv[flags.newAdminKey.name] =
  '302e020100300506032b6570042204200cde8d512569610f184b8b399e91e46899805c6171f7c2b8666d2a417bcc66c2';

argv[flags.generateGossipKeys.name] = true;
argv[flags.generateTlsKeys.name] = true;
// set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;
argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
argv[flags.namespace.name] = namespace.name;
argv[flags.persistentVolumeClaims.name] = true;
argv[flags.quiet.name] = true;

e2eTestSuite(
  namespace.name,
  argv,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  true,
  bootstrapResp => {
    describe('Node update via separated commands', async () => {
      const nodeCmd = bootstrapResp.cmd.nodeCmd;
      const accountCmd = bootstrapResp.cmd.accountCmd;
      const k8Factory = bootstrapResp.opts.k8Factory;
      let existingServiceMap;
      let existingNodeIdsPrivateKeysHash;

      after(async function () {
        this.timeout(Duration.ofMinutes(10).toMillis());

        await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
        await nodeCmd.handlers.stop(argv);
        await k8Factory.default().namespaces().delete(namespace);
      });

      it('cache current version of private keys', async () => {
        existingServiceMap = await bootstrapResp.opts.accountManager.getNodeServiceMap(namespace);
        existingNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
          existingServiceMap,
          k8Factory,
          getTmpDir(),
        );
      }).timeout(Duration.ofMinutes(8).toMillis());

      it('should succeed with init command', async () => {
        const status = await accountCmd.init(argv);
        expect(status).to.be.ok;
      }).timeout(Duration.ofMinutes(8).toMillis());

      it('should update a new node property successfully', async () => {
        // generate gossip and tls keys for the updated node
        const tmpDir = getTmpDir();

        const signingKey = await bootstrapResp.opts.keyManager.generateSigningKey(updateNodeId);
        const signingKeyFiles = await bootstrapResp.opts.keyManager.storeSigningKey(updateNodeId, signingKey, tmpDir);
        nodeCmd.logger.debug(
          `generated test gossip signing keys for node ${updateNodeId} : ${signingKeyFiles.certificateFile}`,
        );
        argv[flags.gossipPublicKey.name] = signingKeyFiles.certificateFile;
        argv[flags.gossipPrivateKey.name] = signingKeyFiles.privateKeyFile;

        const tlsKey = await bootstrapResp.opts.keyManager.generateGrpcTlsKey(updateNodeId);
        const tlsKeyFiles = await bootstrapResp.opts.keyManager.storeTLSKey(updateNodeId, tlsKey, tmpDir);
        nodeCmd.logger.debug(`generated test TLS keys for node ${updateNodeId} : ${tlsKeyFiles.certificateFile}`);
        argv[flags.tlsPublicKey.name] = tlsKeyFiles.certificateFile;
        argv[flags.tlsPrivateKey.name] = tlsKeyFiles.privateKeyFile;

        const tempDir = 'contextDir';
        const argvPrepare = Object.assign({}, argv);
        argvPrepare[flags.outputDir.name] = tempDir;

        const argvExecute = Object.assign({}, getDefaultArgv());
        argvExecute[flags.inputDir.name] = tempDir;

        await nodeCmd.handlers.updatePrepare(argvPrepare);
        await nodeCmd.handlers.updateSubmitTransactions(argvExecute);
        await nodeCmd.handlers.updateExecute(argvExecute);

        expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.UPDATE_CONFIGS_NAME)).to.deep.equal([
          flags.devMode.constName,
          flags.quiet.constName,
          flags.force.constName,
          flags.gossipEndpoints.constName,
          flags.grpcEndpoints.constName,
          'freezeAdminPrivateKey',
        ]);
        await bootstrapResp.opts.accountManager.close();
      }).timeout(Duration.ofMinutes(30).toMillis());

      balanceQueryShouldSucceed(bootstrapResp.opts.accountManager, nodeCmd, namespace, updateNodeId);

      accountCreationShouldSucceed(bootstrapResp.opts.accountManager, nodeCmd, namespace, updateNodeId);

      it('signing key and tls key should not match previous one', async () => {
        const currentNodeIdsPrivateKeysHash = await getNodeAliasesPrivateKeysHash(
          existingServiceMap,
          k8Factory,
          getTmpDir(),
        );

        for (const [nodeAlias, existingKeyHashMap] of existingNodeIdsPrivateKeysHash.entries()) {
          const currentNodeKeyHashMap = currentNodeIdsPrivateKeysHash.get(nodeAlias);

          for (const [keyFileName, existingKeyHash] of existingKeyHashMap.entries()) {
            if (
              nodeAlias === updateNodeId &&
              (keyFileName.startsWith(constants.SIGNING_KEY_PREFIX) || keyFileName.startsWith('hedera'))
            ) {
              expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).not.to.equal(
                `${nodeAlias}:${keyFileName}:${existingKeyHash}`,
              );
            } else {
              expect(`${nodeAlias}:${keyFileName}:${currentNodeKeyHashMap.get(keyFileName)}`).to.equal(
                `${nodeAlias}:${keyFileName}:${existingKeyHash}`,
              );
            }
          }
        }
      }).timeout(defaultTimeout);

      it('config.txt should be changed with new account id', async () => {
        // read config.txt file from first node, read config.txt line by line, it should not contain value of newAccountId
        const pods: V1Pod[] = await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node']);
        const podName: PodName = PodName.of(pods[0].metadata.name);
        const podRef: PodRef = PodRef.of(namespace, podName);
        const containerRef: ContainerRef = ContainerRef.of(podRef, ROOT_CONTAINER);
        const tmpDir: string = getTmpDir();
        await k8Factory
          .default()
          .containers()
          .readByRef(containerRef)
          .copyFrom(`${HEDERA_HAPI_PATH}/config.txt`, tmpDir);
        const configTxt: string = fs.readFileSync(`${tmpDir}/config.txt`, 'utf8');
        console.log('config.txt:', configTxt);

        expect(configTxt).to.contain(newAccountId);
      }).timeout(Duration.ofMinutes(10).toMillis());
    });
  },
);
