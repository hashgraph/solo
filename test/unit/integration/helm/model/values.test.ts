// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {HelmChartValues} from '../../../../../src/integration/helm/model/values.js';

describe('HelmChartValues', (): void => {
  describe('ordering guarantee', (): void => {
    it('userFile() entries always appear after file() entries in toArguments()', (): void => {
      const values: HelmChartValues = new HelmChartValues()
        .file('/solo/defaults.yaml')
        .userFile('/user/override.yaml')
        .file('/solo/profile.yaml');

      const arguments_: string[] = values.toArguments();
      const soloIndexes: number[] = [
        arguments_.indexOf('/solo/defaults.yaml'),
        arguments_.indexOf('/solo/profile.yaml'),
      ];
      const userIndex: number = arguments_.indexOf('/user/override.yaml');

      expect(userIndex).to.be.greaterThan(soloIndexes[0]);
      expect(userIndex).to.be.greaterThan(soloIndexes[1]);
    });

    it('--set flags precede user files so they always win', (): void => {
      const values: HelmChartValues = new HelmChartValues().set('key', 'computed').userFile('/user/override.yaml');

      const arguments_: string[] = values.toArguments();
      expect(arguments_.indexOf('--set')).to.be.lessThan(arguments_.indexOf('--values'));
    });
  });

  describe('add()', (): void => {
    it('merges _arguments into _arguments and _userArguments into _userArguments', (): void => {
      const base: HelmChartValues = new HelmChartValues().file('/base/solo.yaml').userFile('/base/user.yaml');
      const extra: HelmChartValues = new HelmChartValues().file('/extra/solo.yaml').userFile('/extra/user.yaml');

      base.add(extra);
      const arguments_: string[] = base.toArguments();

      expect(arguments_).to.deep.equal([
        '--values',
        '/base/solo.yaml',
        '--values',
        '/extra/solo.yaml',
        '--values',
        '/base/user.yaml',
        '--values',
        '/extra/user.yaml',
      ]);
    });

    it('does not promote user files from the added instance into _arguments', (): void => {
      const base: HelmChartValues = new HelmChartValues().file('/solo/a.yaml');
      const extra: HelmChartValues = new HelmChartValues().userFile('/user/b.yaml');

      base.add(extra);
      const arguments_: string[] = base.toArguments();

      expect(arguments_[0]).to.equal('--values');
      expect(arguments_[1]).to.equal('/solo/a.yaml');
      expect(arguments_[2]).to.equal('--values');
      expect(arguments_[3]).to.equal('/user/b.yaml');
    });
  });

  describe('clone()', (): void => {
    it('copies both _arguments and _userArguments', (): void => {
      const original: HelmChartValues = new HelmChartValues().file('/solo/orig.yaml').userFile('/user/orig.yaml');
      const cloned: HelmChartValues = original.clone();

      expect(cloned.toArguments()).to.deep.equal(original.toArguments());
    });

    it('clone is independent — mutations do not affect the original', (): void => {
      const original: HelmChartValues = new HelmChartValues().file('/solo/orig.yaml');
      const cloned: HelmChartValues = original.clone();

      cloned.file('/solo/extra.yaml');

      expect(original.toArguments()).to.deep.equal(['--values', '/solo/orig.yaml']);
      expect(cloned.toArguments()).to.deep.equal(['--values', '/solo/orig.yaml', '--values', '/solo/extra.yaml']);
    });
  });

  describe('filesFromCommaSeparatedInput()', (): void => {
    it('routes every path to userFile() so they appear last in toArguments()', (): void => {
      const values: HelmChartValues = new HelmChartValues()
        .file('/solo/defaults.yaml')
        .filesFromCommaSeparatedInput('/user/a.yaml,/user/b.yaml');

      // filesFromCommaSeparatedInput calls PathEx.resolve (= path.resolve) on each path.
      // Match against the resolved form so the assertion holds on Windows too.
      const arguments_: string[] = values.toArguments();
      const soloIndex: number = arguments_.indexOf('/solo/defaults.yaml');
      const userAIndex: number = arguments_.indexOf(path.resolve('/user/a.yaml'));
      const userBIndex: number = arguments_.indexOf(path.resolve('/user/b.yaml'));

      expect(userAIndex).to.be.greaterThan(soloIndex);
      expect(userBIndex).to.be.greaterThan(soloIndex);
    });

    it('trims whitespace around commas', (): void => {
      const values: HelmChartValues = new HelmChartValues().filesFromCommaSeparatedInput(' /a.yaml , /b.yaml ');

      // PathEx.resolve normalizes the path; compare against the resolved form for cross-platform safety.
      const arguments_: string[] = values.toArguments();
      expect(arguments_).to.include(path.resolve('/a.yaml'));
      expect(arguments_).to.include(path.resolve('/b.yaml'));
    });

    it('is a no-op for undefined input', (): void => {
      const values: HelmChartValues = new HelmChartValues().filesFromCommaSeparatedInput();
      expect(values.toArguments()).to.deep.equal([]);
    });
  });

  describe('userValueFilePaths()', (): void => {
    it('returns only user-supplied values files in insertion order', (): void => {
      const values: HelmChartValues = new HelmChartValues()
        .file('/solo/defaults.yaml')
        .userFile('/user/a.yaml')
        .set('key', 'value')
        .userFile('/user/b.yaml');

      expect(values.userValueFilePaths()).to.deep.equal(['/user/a.yaml', '/user/b.yaml']);
    });
  });

  describe('addFileForCluster() / addUserFileForCluster()', (): void => {
    it('addFileForCluster routes to _arguments (Solo slot)', (): void => {
      const chartValuesMap: Record<string, HelmChartValues> = {};
      const pathsMap: Record<string, string[]> = {};

      HelmChartValues.addFileForCluster(chartValuesMap, pathsMap, 'cluster-a', '/solo/a.yaml');

      expect(chartValuesMap['cluster-a'].toArguments()).to.deep.equal(['--values', '/solo/a.yaml']);
      expect(pathsMap['cluster-a']).to.deep.equal(['/solo/a.yaml']);
    });

    it('addUserFileForCluster routes to _userArguments (user slot)', (): void => {
      const chartValuesMap: Record<string, HelmChartValues> = {};
      const pathsMap: Record<string, string[]> = {};

      HelmChartValues.addUserFileForCluster(chartValuesMap, pathsMap, 'cluster-a', '/user/a.yaml');

      expect(chartValuesMap['cluster-a'].toArguments()).to.deep.equal(['--values', '/user/a.yaml']);
      expect(pathsMap['cluster-a']).to.deep.equal(['/user/a.yaml']);
    });

    it('user file appears after Solo file when both are added to the same cluster', (): void => {
      const chartValuesMap: Record<string, HelmChartValues> = {};
      const pathsMap: Record<string, string[]> = {};

      HelmChartValues.addFileForCluster(chartValuesMap, pathsMap, 'cluster-a', '/solo/defaults.yaml');
      HelmChartValues.addUserFileForCluster(chartValuesMap, pathsMap, 'cluster-a', '/user/override.yaml');

      expect(chartValuesMap['cluster-a'].toArguments()).to.deep.equal([
        '--values',
        '/solo/defaults.yaml',
        '--values',
        '/user/override.yaml',
      ]);
    });

    it('initializes map entries for a new cluster reference', (): void => {
      const chartValuesMap: Record<string, HelmChartValues> = {};
      const pathsMap: Record<string, string[]> = {};

      HelmChartValues.addFileForCluster(chartValuesMap, pathsMap, 'new-cluster', '/solo/x.yaml');

      expect(chartValuesMap).to.have.key('new-cluster');
      expect(pathsMap).to.have.key('new-cluster');
    });
  });
});
