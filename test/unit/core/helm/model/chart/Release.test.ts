// SPDX-License-Identifier: Apache-2.0

import {Release} from '../../../../../../src/core/helm/model/chart/Release.js';
import {readFileSync} from 'fs';
import {join} from 'path';
import {fileURLToPath} from 'url';

describe('Release', () => {
  describe('deserialization', () => {
    it('should correctly deserialize JSON Release response', () => {
      // Get the directory name of the current module
      const __dirname = fileURLToPath(new URL('.', import.meta.url));

      // Read the test JSON file
      const jsonContent = readFileSync(
        join(__dirname, '..', '..', '..', '..', 'resources', 'mysql-release.json'),
        'utf-8',
      );

      const release = Release.fromJSON(JSON.parse(jsonContent));

      expect(release.name).toBe('mysql');
      expect(release.info.firstDeployed).toBe('2023-06-09T11:53:14.120656-05:00');
      expect(release.info.lastDeployed).toBe('2023-06-09T11:53:14.120656-05:00');
      expect(release.info.deleted).toBe('');
      expect(release.info.description).toBe('Install complete');
      expect(release.info.status).toBe('deployed');
      expect(release.chart.metadata.version).toBe('9.10.2');
      expect(release.chart.metadata.appVersion).toBe('8.0.33');
    });
  });
});
