// SPDX-License-Identifier: Apache-2.0

import {Release} from '../../../../../../src/integration/helm/model/chart/release.js';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect} from 'chai';

describe('Release', () => {
  it('Test Deserializing JSON Release Response', () => {
    // Get the directory name of the current module
    const __dirname = fileURLToPath(new URL('.', import.meta.url));

    // Read the test JSON file
    const jsonContent = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'resources', 'mysql-release.json'),
      'utf-8',
    );

    const data = JSON.parse(jsonContent);
    const release = new Release(undefined, undefined, undefined);
    Object.assign(release, data);

    expect(release.name).to.equal('mysql');
    console.log(`release.info.firstDeployed = ${JSON.stringify(release.info.firstDeployed)}`);
    expect(release.info.firstDeployed).to.equal('2023-06-09T11:53:14.120656-05:00');
    expect(release.info.lastDeployed).to.equal('2023-06-09T11:53:14.120656-05:00');
    expect(release.info.deleted).to.be.empty;
    expect(release.info.description).to.equal('Install complete');
    expect(release.info.status).to.equal('deployed');
    expect(release.chart.metadata.version).to.equal('9.10.2');
    expect(release.chart.metadata.appVersion).to.equal('8.0.33');
  });
});
