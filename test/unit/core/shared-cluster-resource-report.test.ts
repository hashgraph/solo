// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach} from 'mocha';
import sinon from 'sinon';
import {SharedClusterResourceReport} from '../../../src/core/shared-cluster-resource-report.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';

describe('SharedClusterResourceReport', (): void => {
  let showUserStub: sinon.SinonStub;
  let logger: SoloLogger;

  beforeEach((): void => {
    showUserStub = sinon.stub();
    logger = {showUser: showUserStub} as unknown as SoloLogger;
  });

  describe('show', (): void => {
    it('names the resource, context, and what was found', (): void => {
      SharedClusterResourceReport.show(logger, "ClusterRole 'pod-monitor-role'", 'kind-solo', 'a Solo-labelled role');

      expect(showUserStub).to.have.been.calledOnce;
      const message: string = showUserStub.firstCall.args[0] as string;
      expect(message).to.include("Reusing pre-existing ClusterRole 'pod-monitor-role'");
      expect(message).to.include("in context 'kind-solo'");
      expect(message).to.include('found a Solo-labelled role');
      expect(message).to.not.include('expected');
    });

    it('includes the expected version when provided', (): void => {
      SharedClusterResourceReport.show(logger, 'MinIO Operator', 'kind-solo', 'version 6.0.0', 'version 7.1.1');

      const message: string = showUserStub.firstCall.args[0] as string;
      expect(message).to.include('found version 6.0.0');
      expect(message).to.include('expected version 7.1.1');
    });
  });

  describe('formatVersion', (): void => {
    it('formats a known version', (): void => {
      expect(SharedClusterResourceReport.formatVersion('1.2.3')).to.equal('version 1.2.3');
    });

    it('reports a missing version as unknown', (): void => {
      expect(SharedClusterResourceReport.formatVersion()).to.equal('unknown version');
      expect(SharedClusterResourceReport.formatVersion('')).to.equal('unknown version');
    });
  });

  describe('versionFromLabels', (): void => {
    it('prefers the app.kubernetes.io/version label', (): void => {
      const labels: Record<string, string> = {
        'app.kubernetes.io/version': 'v1.13.0',
        'operator.prometheus.io/version': '0.72.0',
      };
      expect(SharedClusterResourceReport.versionFromLabels(labels)).to.equal('version v1.13.0');
    });

    it('falls back to the operator.prometheus.io/version label', (): void => {
      const labels: Record<string, string> = {'operator.prometheus.io/version': '0.72.0'};
      expect(SharedClusterResourceReport.versionFromLabels(labels)).to.equal('version 0.72.0');
    });

    it('reports unknown when no version label is present', (): void => {
      expect(SharedClusterResourceReport.versionFromLabels({})).to.equal('unknown version');
      expect(SharedClusterResourceReport.versionFromLabels()).to.equal('unknown version');
    });
  });
});
