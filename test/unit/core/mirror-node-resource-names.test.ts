// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import sinon from 'sinon';

import {MirrorNodeResourceNames} from '../../../src/core/mirror-node-resource-names.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type K8} from '../../../src/integration/kube/k8.js';

describe('MirrorNodeResourceNames', (): void => {
  const namespace: NamespaceName = NamespaceName.of('solo');

  function k8WithSecrets(existingSecrets: string[]): K8 {
    const exists: sinon.SinonStub = sinon
      .stub()
      .callsFake(async (_namespace: NamespaceName, name: string): Promise<boolean> => existingSecrets.includes(name));
    return {secrets: (): {exists: sinon.SinonStub} => ({exists})} as unknown as K8;
  }

  describe('primary', (): void => {
    const names: MirrorNodeResourceNames = MirrorNodeResourceNames.primary();

    it('uses the historical names', (): void => {
      expect(names.isPrimary).to.be.true;
      expect(names.passwordsSecretName).to.equal('mirror-passwords');
      expect(names.databaseName).to.equal('mirror_node');
      expect(names.databaseUsername('owner')).to.equal('mirror_node');
      expect(names.databaseUsername('rest')).to.equal('mirror_rest');
      expect(names.databaseUsername('restjava')).to.equal('mirror_rest_java');
      expect(names.ingressClassName).to.equal('mirror-ingress-class');
      expect(names.ingressControllerClass).to.equal('mirror-ingress-controller');
      expect(names.ingressControllerName('solo')).to.equal('mirror-ingress-controller-solo');
      expect(names.ingressLeaderConfigMapName).to.equal('ingress-controller-leader-mirror-ingress-class');
      expect(names.tlsSecretName).to.equal('ca-secret-mirror-node');
    });
  });

  describe('forId', (): void => {
    const names: MirrorNodeResourceNames = MirrorNodeResourceNames.forId(2);

    it('suffixes every name with the component id', (): void => {
      expect(names.isPrimary).to.be.false;
      expect(names.passwordsSecretName).to.equal('mirror-passwords-2');
      expect(names.databaseName).to.equal('mirror_node_2');
      expect(names.databaseUsername('owner')).to.equal('mirror_node_2');
      expect(names.databaseUsername('importer')).to.equal('mirror_importer_2');
      expect(names.ingressClassName).to.equal('mirror-ingress-class-2');
      expect(names.ingressControllerClass).to.equal('mirror-ingress-controller-2');
      expect(names.ingressControllerName('solo')).to.equal('mirror-ingress-controller-solo-2');
      expect(names.ingressLeaderConfigMapName).to.equal('ingress-controller-leader-mirror-ingress-class-2');
      expect(names.tlsSecretName).to.equal('ca-secret-mirror-node-2');
    });

    it('keeps the ingress controller names of two mirror nodes in a long namespace apart and within 63 characters', (): void => {
      const namespace: string = 'multiple-mirror-nodes-example-namespace';
      const primary: string = MirrorNodeResourceNames.primary().ingressControllerName(namespace);
      const second: string = names.ingressControllerName(namespace);
      const third: string = MirrorNodeResourceNames.forId(10).ingressControllerName(namespace);

      expect(primary).to.have.length.of.at.most(63);
      expect(second).to.have.length.of.at.most(63);
      expect(second.endsWith('-2')).to.be.true;
      expect(third.endsWith('-10')).to.be.true;
      expect(new Set([primary, second, third]).size).to.equal(3);
    });

    it('never ends the shortened ingress controller name with a dash before the suffix', (): void => {
      // 26 characters of prefix plus a 36 character namespace puts a dash at the cut for id 2
      const namespace: string = `${'a'.repeat(34)}-b-c`;
      const name: string = names.ingressControllerName(namespace);

      expect(name).to.not.include('--');
      expect(name).to.have.length.of.at.most(63);
    });

    it('never shares a database user with the primary mirror node', (): void => {
      const primaryUsers: string[] = Object.values(MirrorNodeResourceNames.primary().databaseUsernames);
      const users: string[] = Object.values(names.databaseUsernames);

      expect(users).to.have.length(8);
      expect(users.filter((user: string): boolean => primaryUsers.includes(user))).to.deep.equal([]);
    });
  });

  describe('resolveExisting', (): void => {
    it('uses the suffixed names when the suffixed passwords secret exists', async (): Promise<void> => {
      const names: MirrorNodeResourceNames = await MirrorNodeResourceNames.resolveExisting(
        k8WithSecrets(['mirror-passwords', 'mirror-passwords-2']),
        namespace,
        2,
      );

      expect(names.passwordsSecretName).to.equal('mirror-passwords-2');
    });

    it('keeps the legacy names of a mirror node deployed before multiple mirror nodes were supported', async (): Promise<void> => {
      const names: MirrorNodeResourceNames = await MirrorNodeResourceNames.resolveExisting(
        k8WithSecrets(['mirror-passwords']),
        namespace,
        2,
      );

      expect(names.isPrimary).to.be.true;
    });
  });

  describe('resolveForDeploy', (): void => {
    it('gives the first mirror node in the namespace the legacy names', async (): Promise<void> => {
      const names: MirrorNodeResourceNames = await MirrorNodeResourceNames.resolveForDeploy(
        k8WithSecrets([]),
        namespace,
        1,
        false,
        false,
      );

      expect(names.isPrimary).to.be.true;
    });

    it('suffixes the names when another mirror node is registered in the namespace', async (): Promise<void> => {
      const names: MirrorNodeResourceNames = await MirrorNodeResourceNames.resolveForDeploy(
        k8WithSecrets(['mirror-passwords']),
        namespace,
        2,
        false,
        true,
      );

      expect(names.passwordsSecretName).to.equal('mirror-passwords-2');
    });

    it('keeps the legacy names when re-running the deploy of the primary mirror node', async (): Promise<void> => {
      const names: MirrorNodeResourceNames = await MirrorNodeResourceNames.resolveForDeploy(
        k8WithSecrets(['mirror-passwords']),
        namespace,
        1,
        true,
        true,
      );

      expect(names.isPrimary).to.be.true;
    });

    it('keeps the suffixed names when re-running the deploy of an additional mirror node', async (): Promise<void> => {
      const names: MirrorNodeResourceNames = await MirrorNodeResourceNames.resolveForDeploy(
        k8WithSecrets(['mirror-passwords', 'mirror-passwords-2']),
        namespace,
        2,
        true,
        true,
      );

      expect(names.passwordsSecretName).to.equal('mirror-passwords-2');
    });
  });
});
