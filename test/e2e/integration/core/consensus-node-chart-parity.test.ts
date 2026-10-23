// SPDX-License-Identifier: Apache-2.0

import {describe, it, before} from 'mocha';
import {expect} from 'chai';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import * as yaml from 'yaml';

import {ConsensusNodeValuesTranslator} from '../../../../src/core/consensus-node-values-translator.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {type AnyObject} from '../../../../src/types/aliases.js';
import * as constants from '../../../../src/core/constants.js';

/**
 * Pins the contract the split charts live or die by: rendering the shared `solo-deployment` release
 * plus one `consensus-node` release per node must produce exactly the object set the umbrella chart
 * produces on its own.
 *
 * `consensus-node` is a fork of the umbrella chart's per-node templates, so it drifts silently — a
 * feature added upstream behind a disabled-by-default value renders identically on both sides until
 * someone turns that value on in production. Each case below therefore renders with the relevant
 * values enabled rather than trusting the defaults.
 *
 * Needs a solo-charts checkout and the `helm` binary:
 *
 *     SOLO_CHARTS_DIR=<solo-charts>/charts task test-e2e-integration
 */
const chartsDirectory: string | undefined = process.env.SOLO_CHARTS_DIR;

/** Secret bodies are regenerated per `helm template` run, so only their presence is comparable. */
const GENERATED_SECRET_NAMES: ReadonlySet<string> = new Set([
  'haproxy-secrets',
  'minio-secrets',
  'uploader-mirror-secrets',
]);

type RenderedObject = {apiVersion?: string; kind: string; metadata?: {name?: string}};

function objectKey(object_: RenderedObject): string {
  return `${object_.kind}/${object_.metadata?.name}`;
}

function parseManifests(manifest: string): Map<string, RenderedObject> {
  const objects: Map<string, RenderedObject> = new Map<string, RenderedObject>();
  for (const document of yaml.parseAllDocuments(manifest)) {
    const object_: unknown = document.toJS();
    if (object_ && typeof object_ === 'object' && 'kind' in object_) {
      objects.set(objectKey(object_ as RenderedObject), object_ as RenderedObject);
    }
  }
  return objects;
}

function helmTemplate(releaseName: string, chartPath: string, valuesFile: string): string {
  return execFileSync(
    'helm',
    ['template', releaseName, chartPath, '--namespace', 'chart-parity', '--values', valuesFile],
    {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
  );
}

/**
 * Field-by-field difference between two rendered objects, as `path` strings. Helm's own bookkeeping
 * labels necessarily differ between a one-release and a many-release layout and are excluded.
 */
function differences(left: unknown, right: unknown, at: string = ''): string[] {
  if (at.includes('helm.sh/chart') || at.includes('app.kubernetes.io/managed-by')) {
    return [];
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return [`${at}[]`];
    }
    return left.flatMap((item: unknown, index: number): string[] => differences(item, right[index], `${at}[${index}]`));
  }

  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const keys: Set<string> = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].flatMap((key: string): string[] =>
      differences((left as AnyObject)[key], (right as AnyObject)[key], `${at}.${key}`),
    );
  }

  return left === right ? [] : [`${at} (${JSON.stringify(left)} != ${JSON.stringify(right)})`];
}

describe('consensus-node chart renders the same objects as the umbrella chart', (): void => {
  let workDirectory: string;

  before(function (): void {
    if (!chartsDirectory || !fs.existsSync(PathEx.join(chartsDirectory, constants.CONSENSUS_NODE_CHART))) {
      // mocha's own skip mechanism; it is only reachable through the hook's `this`
      // eslint-disable-next-line unicorn/no-this-outside-of-class
      this.skip();
    }
    workDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'chart-parity-'));
  });

  /**
   * Renders one umbrella values set both ways and returns every object that is present on only one
   * side, paired with every field that differs between the two renders of the same object.
   */
  function compareRenders(caseName: string, overrides: AnyObject): {missing: string[]; changed: string[]} {
    const caseDirectory: string = PathEx.join(workDirectory, caseName);
    fs.mkdirSync(caseDirectory, {recursive: true});

    // Layering the overrides over the chart's own values through the translator's merge is how Solo
    // assembles them at deploy time, so the case values reach both renders identically.
    const umbrella: AnyObject = ConsensusNodeValuesTranslator.mergeValuesFiles([
      PathEx.join(chartsDirectory, constants.SOLO_DEPLOYMENT_CHART, 'values.yaml'),
      ConsensusNodeValuesTranslator.writeValuesFile(caseDirectory, 'overrides.yaml', overrides),
    ]);

    const sharedValuesFile: string = ConsensusNodeValuesTranslator.writeValuesFile(
      caseDirectory,
      'shared.yaml',
      ConsensusNodeValuesTranslator.toSharedValues(umbrella),
    );
    const umbrellaValuesFile: string = ConsensusNodeValuesTranslator.writeValuesFile(
      caseDirectory,
      'umbrella.yaml',
      umbrella,
    );

    const umbrellaChart: string = PathEx.join(chartsDirectory, constants.SOLO_DEPLOYMENT_CHART);
    const perNodeChart: string = PathEx.join(chartsDirectory, constants.CONSENSUS_NODE_CHART);

    const expected: Map<string, RenderedObject> = parseManifests(
      helmTemplate(constants.SOLO_DEPLOYMENT_CHART, umbrellaChart, umbrellaValuesFile),
    );

    const nodeNames: string[] = ((umbrella.hedera as AnyObject)?.nodes as AnyObject[]).map(
      (node: AnyObject): string => node.name as string,
    );

    let splitManifest: string = helmTemplate(constants.SOLO_DEPLOYMENT_CHART, umbrellaChart, sharedValuesFile);
    for (const nodeName of nodeNames) {
      const nodeValuesFile: string = ConsensusNodeValuesTranslator.writeValuesFile(
        caseDirectory,
        `${nodeName}.yaml`,
        ConsensusNodeValuesTranslator.toNodeValues(umbrella, nodeName),
      );
      splitManifest += `\n---\n${helmTemplate(`${constants.CONSENSUS_NODE_CHART}-${nodeName}`, perNodeChart, nodeValuesFile)}`;
    }
    const actual: Map<string, RenderedObject> = parseManifests(splitManifest);

    const missing: string[] = [
      ...[...expected.keys()]
        .filter((key: string): boolean => !actual.has(key))
        .map((key: string): string => `-${key}`),
      ...[...actual.keys()]
        .filter((key: string): boolean => !expected.has(key))
        .map((key: string): string => `+${key}`),
    ];

    const changed: string[] = [];
    for (const [key, expectedObject] of expected) {
      const actualObject: RenderedObject | undefined = actual.get(key);
      if (!actualObject || GENERATED_SECRET_NAMES.has(expectedObject.metadata?.name ?? '')) {
        continue;
      }
      changed.push(...differences(expectedObject, actualObject).map((field: string): string => `${key}${field}`));
    }

    return {missing, changed};
  }

  const cases: Array<{name: string; overrides: AnyObject}> = [
    {name: 'chart defaults', overrides: {}},
    {
      // The capacity-check init container is gated off by default, so only this case can see it.
      name: 'persistent volumes with the capacity check on',
      overrides: {defaults: {volumeClaims: {enabled: true, capacityCheck: {enabled: true}}}},
    },
    {
      // Drops the data/lib and data/apps volumes, claims and mounts, and chowns config to uid 2000.
      name: 'an image that already carries the application jars',
      overrides: {defaults: {volumeClaims: {enabled: true, appJarsInImage: true}}},
    },
  ];

  for (const {name, overrides} of cases) {
    it(`renders the same object set with ${name}`, (): void => {
      const {missing, changed} = compareRenders(name.replaceAll(/\W+/g, '-'), overrides);

      expect(missing, `objects present on only one side with ${name}`).to.deep.equal([]);
      expect(changed, `fields that differ between the two renders with ${name}`).to.deep.equal([]);
    }).timeout(120_000);
  }
});
