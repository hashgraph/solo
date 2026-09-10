// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import {MetricsServerImpl} from '../../../../../src/business/runtime-state/services/metrics-server-impl.js';

describe('MetricsServerImpl', (): void => {
  describe('isMirrorNodePostgresPodName', (): void => {
    it('should match the shared-resources postgres pod', (): void => {
      expect(MetricsServerImpl.isMirrorNodePostgresPodName('solo-shared-resources-postgres-0')).to.be.true;
      expect(MetricsServerImpl.isMirrorNodePostgresPodName('solo-shared-resources-postgres-1')).to.be.true;
    });

    it('should match the embedded mirror node postgres pod', (): void => {
      expect(MetricsServerImpl.isMirrorNodePostgresPodName('mirror-postgresql-0')).to.be.true;
    });

    it('should match the legacy standalone postgres pod', (): void => {
      expect(MetricsServerImpl.isMirrorNodePostgresPodName('my-postgresql-0')).to.be.true;
    });

    it('should not match unrelated pods', (): void => {
      expect(MetricsServerImpl.isMirrorNodePostgresPodName('network-node1-0')).to.be.false;
      expect(MetricsServerImpl.isMirrorNodePostgresPodName('haproxy-node1-0')).to.be.false;
      expect(MetricsServerImpl.isMirrorNodePostgresPodName('minio-pool-1-0')).to.be.false;
      expect(MetricsServerImpl.isMirrorNodePostgresPodName('mirror-importer-0')).to.be.false;
    });
  });
});
