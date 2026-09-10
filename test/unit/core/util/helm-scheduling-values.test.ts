// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {HelmSchedulingValues} from '../../../../src/core/util/helm-scheduling-values.js';
import {HelmChartValues} from '../../../../src/integration/helm/model/values.js';
import {ValuesFileParseFailedSoloError} from '../../../../src/core/errors/classes/validation/values-file-parse-failed-solo-error.js';

describe('Helm scheduling values', (): void => {
  let temporaryDirectory: string;

  beforeEach((): void => {
    temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-helm-scheduling-values-'));
  });

  afterEach((): void => {
    fs.rmSync(temporaryDirectory, {force: true, recursive: true});
  });

  it('should copy top-level and component scheduling values to a target chart path', (): void => {
    const valuesFilePath: string = PathEx.join(temporaryDirectory, 'values.yaml');
    fs.writeFileSync(
      valuesFilePath,
      `
nodeSelector:
  solo.hashgraph.io/network-id: "7"
  solo.hashgraph.io/owner: adhoc-performance-test
tolerations:
  - key: solo.hashgraph.io/owner
    operator: Equal
    value: adhoc-performance-test
    effect: NoSchedule
pinger:
  nodeSelector:
    solo.hashgraph.io/role: consensus-node
  tolerations:
    - key: solo.hashgraph.io/role
      operator: Equal
      value: consensus-node
      effect: NoSchedule
`,
    );
    const sourceChartValues: HelmChartValues = new HelmChartValues().file(valuesFilePath);

    const pingerChartValues: HelmChartValues = HelmSchedulingValues.buildSchedulingChartValues(
      sourceChartValues,
      'pinger',
      'pinger',
    );

    const valueArguments: string[] = pingerChartValues.toArguments();
    expect(valueArguments).to.include(String.raw`pinger.nodeSelector.solo\.hashgraph\.io/network-id=7`);
    expect(valueArguments).to.include(String.raw`pinger.nodeSelector.solo\.hashgraph\.io/owner=adhoc-performance-test`);
    expect(valueArguments).to.include(String.raw`pinger.nodeSelector.solo\.hashgraph\.io/role=consensus-node`);
    expect(valueArguments).to.include('pinger.tolerations[0].key=solo.hashgraph.io/owner');
    expect(valueArguments).to.include('pinger.tolerations[0].value=adhoc-performance-test');
    expect(valueArguments).to.include('pinger.tolerations[1].key=solo.hashgraph.io/role');
    expect(valueArguments).to.include('pinger.tolerations[1].value=consensus-node');
  });

  it('should copy top-level scheduling values to ingress controller values', (): void => {
    const valuesFilePath: string = PathEx.join(temporaryDirectory, 'values.yaml');
    fs.writeFileSync(
      valuesFilePath,
      `
nodeSelector:
  solo.hashgraph.io/network-id: "7"
  solo.hashgraph.io/owner: adhoc-performance-test
  solo.hashgraph.io/role: consensus-node
tolerations:
  - key: solo.hashgraph.io/owner
    operator: Equal
    value: adhoc-performance-test
    effect: NoSchedule
`,
    );
    const sourceChartValues: HelmChartValues = new HelmChartValues().file(valuesFilePath);

    const ingressControllerChartValues: HelmChartValues = HelmSchedulingValues.buildSchedulingChartValues(
      sourceChartValues,
      'controller',
    );

    const valueArguments: string[] = ingressControllerChartValues.toArguments();
    expect(valueArguments).to.include(String.raw`controller.nodeSelector.solo\.hashgraph\.io/network-id=7`);
    expect(valueArguments).to.include(
      String.raw`controller.nodeSelector.solo\.hashgraph\.io/owner=adhoc-performance-test`,
    );
    expect(valueArguments).to.include(String.raw`controller.nodeSelector.solo\.hashgraph\.io/role=consensus-node`);
    expect(valueArguments).to.include('controller.tolerations[0].key=solo.hashgraph.io/owner');
    expect(valueArguments).to.include('controller.tolerations[0].value=adhoc-performance-test');
  });

  it('should fail with a coded error naming the values file when it cannot be parsed', (): void => {
    const valuesFilePath: string = PathEx.join(temporaryDirectory, 'stale-values.yaml');
    fs.writeFileSync(valuesFilePath, 'nodeSelector:\n  solo.hashgraph.io/owner: "unterminated\n');
    const sourceChartValues: HelmChartValues = new HelmChartValues().file(valuesFilePath);

    let thrownError: ValuesFileParseFailedSoloError | undefined;
    try {
      HelmSchedulingValues.buildSchedulingChartValues(sourceChartValues, 'controller');
    } catch (error) {
      thrownError = error as ValuesFileParseFailedSoloError;
    }

    expect(thrownError).to.be.instanceof(ValuesFileParseFailedSoloError);
    expect(thrownError.message).to.contain(valuesFilePath);
    expect(thrownError.getFormattedCode()).to.equal('SOLO-4079');
  });
});
