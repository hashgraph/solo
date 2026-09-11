// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import fs from 'node:fs';
import yaml from 'yaml';
import * as constants from '../../../src/core/constants.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';

interface MirrorNodePerformanceValuesConfig {
  importer?: {
    env?: {
      JAVA_TOOL_OPTIONS?: string;
    };
    volumeMounts?: {
      jfr?: {
        mountPath?: string;
      };
    };
  };
}

describe('Mirror node performance (JFR) values', (): void => {
  const performanceValuesFile: string = PathEx.joinWithRealPath(
    constants.RESOURCES_DIR,
    'mirror-node-perf-values.yaml',
  );

  it('should enable a continuous on-disk Java Flight Recording on the importer', (): void => {
    const valuesContent: string = fs.readFileSync(performanceValuesFile, 'utf8');
    const parsedValues: MirrorNodePerformanceValuesConfig = yaml.parse(
      valuesContent,
    ) as MirrorNodePerformanceValuesConfig;
    const javaToolOptions: string | undefined = parsedValues.importer?.env?.JAVA_TOOL_OPTIONS;

    expect(javaToolOptions, 'importer.env.JAVA_TOOL_OPTIONS should be defined').to.be.a('string');
    expect(javaToolOptions, 'JAVA_TOOL_OPTIONS should start a flight recording').to.include(
      '-XX:StartFlightRecording=',
    );
    expect(javaToolOptions, 'recording should stream to disk').to.include('disk=true');
    expect(javaToolOptions, 'recording should dump on JVM exit').to.include('dumponexit=true');
    expect(javaToolOptions, 'recording should use the built-in profile settings').to.include('settings=profile');
    expect(javaToolOptions, 'chunks should rotate at a bounded size').to.include('maxchunksize=');
  });

  it('should point the JFR repository at constants.MIRROR_NODE_JFR_REPOSITORY_DIRECTORY', (): void => {
    const valuesContent: string = fs.readFileSync(performanceValuesFile, 'utf8');
    const parsedValues: MirrorNodePerformanceValuesConfig = yaml.parse(
      valuesContent,
    ) as MirrorNodePerformanceValuesConfig;
    const javaToolOptions: string | undefined = parsedValues.importer?.env?.JAVA_TOOL_OPTIONS;

    // The overlay's repository must match the path `mirror node collect-jfr` reads from.
    expect(
      javaToolOptions,
      'FlightRecorderOptions repository must match the constant collect-jfr reads from',
    ).to.include(`repository=${constants.MIRROR_NODE_JFR_REPOSITORY_DIRECTORY}`);
  });

  it('should mount a dedicated writable volume at the JFR repository path', (): void => {
    const valuesContent: string = fs.readFileSync(performanceValuesFile, 'utf8');
    const parsedValues: MirrorNodePerformanceValuesConfig = yaml.parse(
      valuesContent,
    ) as MirrorNodePerformanceValuesConfig;
    const jfrMountPath: string | undefined = parsedValues.importer?.volumeMounts?.jfr?.mountPath;

    // The importer's root filesystem is read-only, so JFR must write into a mounted volume at the repository path.
    expect(jfrMountPath, 'JFR volume must be mounted at the repository collect-jfr reads from').to.equal(
      constants.MIRROR_NODE_JFR_REPOSITORY_DIRECTORY,
    );
  });
});
