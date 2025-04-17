// SPDX-License-Identifier: Apache-2.0

import {readFileSync} from 'node:fs';
import {parse, stringify} from 'yaml';
import {expect} from 'chai';
import {instanceToPlain} from 'class-transformer';
import {SemVer} from 'semver';
import {beforeEach} from 'mocha';
import os from 'node:os';
import {LocalConfig} from '../../../../../../src/data/schema/model/local/local-config.js';
import {Deployment} from '../../../../../../src/data/schema/model/local/deployment.js';
import {LocalConfigSchema} from '../../../../../../src/data/schema/migration/impl/local/local-config-schema.js';
import {CTObjectMapper} from '../../../../../../src/data/mapper/impl/ct-object-mapper.js';
import {ApplicationVersions} from '../../../../../../src/data/schema/model/common/application-versions.js';
import {
  getSoloVersion,
  HEDERA_EXPLORER_VERSION,
  HEDERA_JSON_RPC_RELAY_VERSION,
  HEDERA_PLATFORM_VERSION,
  MIRROR_NODE_VERSION,
  SOLO_CHART_VERSION,
} from '../../../../../../version.js';
import {ConfigKeyFormatter} from '../../../../../../src/data/key/config-key-formatter.js';

describe('LocalConfig', () => {
  const schema: LocalConfigSchema = new LocalConfigSchema(new CTObjectMapper(ConfigKeyFormatter.instance()));
  const localConfigPath = `test/data/v${getSoloVersion()}-local-config.yaml`;

  describe('Class Transformer', () => {
    let yamlData: string;
    let plainObject: object;

    beforeEach(() => {
      yamlData = readFileSync(localConfigPath, 'utf8');
      expect(yamlData).to.not.be.undefined.and.to.not.be.null;

      plainObject = parse(yamlData);
      expect(plainObject).to.not.be.undefined.and.to.not.be.null;
    });

    it('should transform plain to class', async () => {
      const lc = await schema.transform(plainObject);
      expect(lc).to.not.be.undefined.and.to.not.be.null;
      expect(lc).to.be.instanceOf(LocalConfig);
      expect(lc.versions.cli).to.be.instanceOf(SemVer);
      expect(lc.versions.cli).to.deep.equal(new SemVer('0.35.1'));
      expect(lc.deployments).to.have.lengthOf(2);
      expect(lc.deployments[0].name).to.equal('dual-cluster-full-deployment');
      expect(lc.deployments[0].realm).to.equal(0);
      expect(lc.deployments[0].shard).to.equal(0);
      expect(lc.deployments[1].name).to.equal('deployment');
      expect(lc.deployments[1].realm).to.equal(0);
      expect(lc.deployments[1].shard).to.equal(0);
      expect(lc.clusterRefs).to.be.instanceOf(Map);
      expect(lc.clusterRefs).to.have.lengthOf(4);
      expect(lc.userIdentity).to.not.be.undefined.and.to.not.be.null;
      expect(lc.userIdentity.name).to.be.equal(os.userInfo().username);
    });

    it('should transform class to plain', async () => {
      const deployments: Deployment[] = [
        new Deployment('dual-cluster-full-deployment', 'dual-cluster-full', ['e2e-cluster-1', 'e2e-cluster-2'], 0, 0),
        new Deployment('deployment', 'solo-e2e', ['cluster-1'], 0, 0),
      ];

      const clusterReferences: Map<string, string> = new Map<string, string>();
      clusterReferences.set('cluster-1', 'context-1');
      clusterReferences.set('cluster-2', 'context-2');
      clusterReferences.set('e2e-cluster-1', 'kind-solo-e2e-c1');
      clusterReferences.set('e2e-cluster-2', 'kind-solo-e2e-c2');

      const versions = new ApplicationVersions(
        new SemVer(getSoloVersion()),
        new SemVer(SOLO_CHART_VERSION),
        new SemVer(HEDERA_PLATFORM_VERSION),
        new SemVer(MIRROR_NODE_VERSION),
        new SemVer(HEDERA_EXPLORER_VERSION),
        new SemVer(HEDERA_JSON_RPC_RELAY_VERSION),
      );
      const lc = new LocalConfig(2, versions, deployments, clusterReferences);
      const newPlainObject: object = instanceToPlain(lc);

      expect(newPlainObject).to.not.be.undefined.and.to.not.be.null;

      const poClone = instanceToPlain(await schema.transform(plainObject));
      expect(newPlainObject).to.deep.equal(poClone);

      const yaml: string = stringify(newPlainObject, {sortMapEntries: true});
      expect(yaml).to.not.be.undefined.and.to.not.be.null;
      expect(yaml).to.not.be.empty;
      expect(yaml).to.equal(stringify(poClone, {sortMapEntries: true}));
    });
  });
});
