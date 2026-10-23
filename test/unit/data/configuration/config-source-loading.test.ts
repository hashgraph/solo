// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {beforeEach, describe, it} from 'mocha';
import {container} from 'tsyringe-neo';
import {SoloConfigSchema} from '../../../../src/data/schema/model/solo/solo-config-schema.js';
import {WrapsSchema} from '../../../../src/data/schema/model/solo/wraps-schema.js';
import {SoloConfig} from '../../../../src/business/runtime-state/config/solo/solo-config.js';
import {type ConfigProvider} from '../../../../src/data/configuration/api/config-provider.js';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {resetForTest} from '../../../test-container.js';

describe('config source loading', (): void => {
  let configProvider: ConfigProvider;

  beforeEach((): void => {
    resetForTest();
    configProvider = container.resolve<ConfigProvider>(InjectTokens.ConfigProvider);
  });

  it('returns no config at all until refresh(), leaving every YAML file and SOLO_* override inert', (): void => {
    expect(configProvider.config().asObject(SoloConfigSchema)).to.not.exist;
  });

  it('resolves YAML-backed values once the sources are loaded', async (): Promise<void> => {
    await configProvider.config().refresh();

    // helmChart.name only ever has this value if helm-chart-config.yaml was actually read —
    // the schema constructor defaults it to the empty string.
    expect(SoloConfig.getConfig(configProvider).helmChart.name).to.equal('solo-deployment');
  });

  it('keeps resources/config/tss-config.yaml in step with the WRAPS schema defaults', async (): Promise<void> => {
    // The YAML outranks the schema constructor defaults at runtime, so drift between the two silently
    // changes which WRAPS artifacts are downloaded. The file sat on v0.2.0 while the schema moved to
    // v1.0.0 precisely because nothing loaded it.
    await configProvider.config().refresh();

    const defaults: WrapsSchema = new WrapsSchema();
    const config: SoloConfig = SoloConfig.getConfig(configProvider);

    expect(config.tss.wraps.directoryName).to.equal(defaults.directoryName);
    expect(config.tss.wraps.artifactsFolderName).to.equal(defaults.artifactsFolderName);
    expect(config.tss.wraps.libraryDownloadUrl).to.equal(defaults.libraryDownloadUrl);
    expect(config.tss.wraps.allowedKeyFiles).to.equal(defaults.allowedKeyFiles);
  });
});
