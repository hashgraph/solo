// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import fs from 'node:fs';
import yaml from 'yaml';
import * as constants from '../../../src/core/constants.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';

interface BlockNodePersistenceVolumeConfig {
  size?: string;
  existingClaim?: string;
}

interface BlockNodePersistenceConfig {
  archive?: BlockNodePersistenceVolumeConfig;
  live?: BlockNodePersistenceVolumeConfig;
  logging?: BlockNodePersistenceVolumeConfig;
}

interface BlockNodeValuesConfig {
  blockNode?: {
    config?: {
      ROSTER_BOOTSTRAP_TSS_BLOCK_NODE_SOURCES_PATH?: string;
    };
    persistence?: BlockNodePersistenceConfig;
  };
}

describe('Block node default values', (): void => {
  it('should not hardcode persistence existingClaim values in default values', (): void => {
    const valuesContent: string = fs.readFileSync(constants.BLOCK_NODE_VALUES_FILE, 'utf8');
    const parsedValues: BlockNodeValuesConfig = yaml.parse(valuesContent) as BlockNodeValuesConfig;
    const persistence: BlockNodePersistenceConfig | undefined = parsedValues.blockNode?.persistence;

    expect(persistence, 'blockNode.persistence should be defined').to.not.equal(undefined);
    expect(persistence?.archive?.size, 'blockNode.persistence.archive.size').to.equal('1Gi');
    expect(persistence?.live?.size, 'blockNode.persistence.live.size').to.equal('1Gi');
    expect(persistence?.logging?.size, 'blockNode.persistence.logging.size').to.equal('1Gi');
    expect(persistence?.archive?.existingClaim, 'archive existingClaim must remain unset by default').to.equal(
      undefined,
    );
    expect(persistence?.live?.existingClaim, 'live existingClaim must remain unset by default').to.equal(undefined);
    expect(persistence?.logging?.existingClaim, 'logging existingClaim must remain unset by default').to.equal(
      undefined,
    );
  });

  it('should wire the TSS bootstrap plugin to the block node sources file', (): void => {
    const valuesContent: string = fs.readFileSync(constants.BLOCK_NODE_VALUES_FILE, 'utf8');
    const parsedValues: BlockNodeValuesConfig = yaml.parse(valuesContent) as BlockNodeValuesConfig;

    expect(parsedValues.blockNode?.config?.ROSTER_BOOTSTRAP_TSS_BLOCK_NODE_SOURCES_PATH).to.equal(
      '/opt/hiero/block-node/backfill/block-node-sources.json',
    );
  });
});

interface BlockNodePerformanceValuesConfig {
  blockNode?: {
    config?: {
      JAVA_OPTS?: string;
    };
  };
}

describe('Block node TSS values', (): void => {
  const tssValuesFile: string = constants.BLOCK_NODE_TSS_VALUES_FILE;

  it('should size JVM memory for the TSS bootstrap block message', (): void => {
    const valuesContent: string = fs.readFileSync(tssValuesFile, 'utf8');
    const parsedValues: BlockNodePerformanceValuesConfig = yaml.parse(
      valuesContent,
    ) as BlockNodePerformanceValuesConfig;
    const javaOptions: string | undefined = parsedValues.blockNode?.config?.JAVA_OPTS;

    expect(javaOptions, 'TSS JAVA_OPTS should be defined').to.be.a('string');
    expect(javaOptions, 'TSS heap should have enough headroom for the large bootstrap block').to.include('-Xmx512m');
    expect(javaOptions, 'TSS direct memory should be larger than one max block message').to.include(
      '-XX:MaxDirectMemorySize=128m',
    );
  });
});

describe('Block node performance (JFR) values', (): void => {
  const performanceValuesFile: string = PathEx.joinWithRealPath(constants.RESOURCES_DIR, 'block-node-perf-values.yaml');

  it('should enable a continuous on-disk Java Flight Recording', (): void => {
    const valuesContent: string = fs.readFileSync(performanceValuesFile, 'utf8');
    const parsedValues: BlockNodePerformanceValuesConfig = yaml.parse(
      valuesContent,
    ) as BlockNodePerformanceValuesConfig;
    const javaOptions: string | undefined = parsedValues.blockNode?.config?.JAVA_OPTS;

    expect(javaOptions, 'blockNode.config.JAVA_OPTS should be defined').to.be.a('string');
    expect(javaOptions, 'JAVA_OPTS should start a flight recording').to.include('-XX:StartFlightRecording=');
    expect(javaOptions, 'recording should stream to disk').to.include('disk=true');
    expect(javaOptions, 'recording should dump on JVM exit').to.include('dumponexit=true');
    expect(javaOptions, 'recording should use the built-in profile settings').to.include('settings=profile');
    expect(javaOptions, 'chunks should rotate at a bounded size').to.include('maxchunksize=');
  });

  it('should point the JFR repository at constants.BLOCK_NODE_JFR_REPOSITORY_DIRECTORY', (): void => {
    const valuesContent: string = fs.readFileSync(performanceValuesFile, 'utf8');
    const parsedValues: BlockNodePerformanceValuesConfig = yaml.parse(
      valuesContent,
    ) as BlockNodePerformanceValuesConfig;
    const javaOptions: string | undefined = parsedValues.blockNode?.config?.JAVA_OPTS;

    // `solo block node collect-jfr` reads chunks from constants.BLOCK_NODE_JFR_REPOSITORY_DIRECTORY, so the
    // repository configured in this overlay must match it exactly.
    expect(javaOptions, 'FlightRecorderOptions repository must match the constant collect-jfr reads from').to.include(
      `repository=${constants.BLOCK_NODE_JFR_REPOSITORY_DIRECTORY}`,
    );
  });
});
