// SPDX-License-Identifier: Apache-2.0

import {readFileSync} from 'fs';
import {dumpYaml, loadYaml} from '@kubernetes/client-node';
import {expect} from 'chai';
import {classToPlain, instanceToPlain, plainToClass} from 'class-transformer';
import {LocalConfig} from '../../../../../src/data/model/local/local_config.js';
import {SemVer} from 'semver';
import {beforeEach} from 'mocha';
import {Deployment} from '../../../../../src/data/model/local/deployment.js';
import {dump} from 'eslint-plugin-n/lib/types-code-path-analysis/debug-helpers.js';
import exp from 'node:constants';

describe('LocalConfig', () => {
  const localConfigPath = 'test/data/local-config.yaml';

  describe('Class Transformer', () => {
    let yamlData: string;
    let plainObject: object;

    beforeEach(() => {
      yamlData = readFileSync(localConfigPath, 'utf8');
      expect(yamlData).to.not.be.undefined.and.to.not.be.null;

      plainObject = loadYaml<object>(yamlData);
      expect(plainObject).to.not.be.undefined.and.to.not.be.null;

      // Migrate deployments to array
      const rd: object[] = [];
      const deployments: object = plainObject['deployments'];
      for (const key in deployments) {
        expect(deployments[key]).to.not.be.undefined.and.to.not.be.null;
        const d = deployments[key];
        d['name'] = key;
        rd.push(d);
      }

      plainObject['deployments'] = rd;
    });

    it('should transform plain to class', async () => {
      const lc = plainToClass(LocalConfig, plainObject);
      expect(lc).to.not.be.undefined.and.to.not.be.null;
      expect(lc.soloVersion).to.deep.equal(new SemVer('0.35.1'));
      expect(lc.deployments).to.have.lengthOf(2);
      expect(lc.deployments[0].name).to.equal('dual-cluster-full-deployment');
      expect(lc.deployments[1].name).to.equal('deployment');
      expect(lc.clusterRefs).to.be.instanceOf(Map);
      expect(lc.clusterRefs).to.have.lengthOf(4);
    });

    it('should transform class to plain', async () => {
      const deployments: Deployment[] = [
        new Deployment('dual-cluster-full-deployment', 'dual-cluster-full', ['e2e-cluster-1', 'e2e-cluster-2']),
        new Deployment('deployment', 'solo-e2e', ['cluster-1']),
      ];

      const clusterRefs: Map<string, string> = new Map<string, string>();
      clusterRefs.set('cluster-1', 'context-1');
      clusterRefs.set('cluster-2', 'context-2');
      clusterRefs.set('e2e-cluster-1', 'kind-solo-e2e-c1');
      clusterRefs.set('e2e-cluster-2', 'kind-solo-e2e-c2');

      const lc = new LocalConfig(new SemVer('0.35.1'), deployments, clusterRefs);
      const newPlainObject: object = instanceToPlain(lc);

      expect(newPlainObject).to.not.be.undefined.and.to.not.be.null;

      const poClone: object = {...plainObject};
      delete poClone['userEmailAddress'];
      expect(newPlainObject).to.deep.equal(poClone);

      const yaml: string = dumpYaml(newPlainObject, {sortKeys: true});
      expect(yaml).to.not.be.undefined.and.to.not.be.null;
      expect(yaml).to.not.be.empty;
      expect(yaml).to.equal(dumpYaml(poClone, {sortKeys: true}));
    });
  });
});
