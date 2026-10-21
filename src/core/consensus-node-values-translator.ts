// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import * as yaml from 'yaml';

import {PathEx} from '../business/utils/path-ex.js';
import {SoloErrors} from './errors/solo-errors.js';
import {UserInput} from './user-input.js';
import {ValuesFileParser} from './util/values-file-parser.js';
import {type AnyObject} from '../types/aliases.js';

/**
 * Translates the umbrella `solo-deployment` values shape into the two shapes the split charts need:
 * the **shared** release keeps the umbrella shape with the node list emptied, so it renders only the
 * network-scoped objects; each **per-node** release gets a flat shape, because a single-node chart
 * has no `hedera.nodes` array to index and no `defaults:` section to merge against.
 *
 * A pure data transform over already-merged values, so it is testable without a cluster or Helm.
 */
export class ConsensusNodeValuesTranslator {
  /** Umbrella `defaults.*` keys that become top-level keys on a per-node release. */
  private static readonly LIFTED_DEFAULT_KEYS: readonly string[] = [
    'volumeClaims',
    'root',
    'consensus',
    'haproxy',
    'envoyProxy',
    'sidecars',
  ];

  /** Umbrella keys copied verbatim onto a per-node release. */
  private static readonly PASSTHROUGH_KEYS: readonly string[] = [
    'global',
    'cloud',
    'cheetah',
    'deployment',
    'haproxyDeployment',
    'envoyDeployment',
    'terminationGracePeriodSeconds',
  ];

  /**
   * Deep-merges an ordered list of values files, later files winning, mirroring how Helm layers
   * `--values` arguments. Missing files are skipped so the caller can pass an optimistic list; an
   * unparseable one fails the command, per {@link ValuesFileParser}.
   */
  public static mergeValuesFiles(paths: string[]): AnyObject {
    let merged: AnyObject = {};

    for (const path of paths) {
      if (!fs.existsSync(path)) {
        continue;
      }

      const parsed: unknown = ValuesFileParser.parse(path, fs.readFileSync(path, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        merged = ConsensusNodeValuesTranslator.deepMerge(merged, parsed as AnyObject);
      }
    }

    return merged;
  }

  /**
   * Reconstructs the effective umbrella values from the Helm arguments Solo assembled: `--values`
   * files in order, then every `--set*` override folded on top. The overrides carry values Solo
   * computes at runtime (storage backend, `crds.*` toggles, static IPs, per-node names) that appear
   * in no values file, so translating the files alone silently drops them.
   *
   * Known limitation: an unescaped comma in a `--set` value is treated as part of the value rather
   * than as Helm's list separator. Solo does not currently emit such values.
   *
   * @param arguments_ - `HelmChartValues.toArguments()` output
   */
  public static fromHelmArguments(arguments_: string[]): AnyObject {
    const filePaths: string[] = [];
    const overrides: Array<{path: string; value: unknown}> = [];

    for (let index: number = 0; index < arguments_.length - 1; index++) {
      const flag: string = arguments_[index];
      const argument: string = arguments_[index + 1];

      if (flag === '--values') {
        filePaths.push(argument);
        index++;
        continue;
      }

      if (flag !== '--set' && flag !== '--set-literal' && flag !== '--set-string' && flag !== '--set-file') {
        continue;
      }

      const separator: number = argument.indexOf('=');
      if (separator === -1) {
        continue;
      }

      const path: string = argument.slice(0, separator);
      const raw: string = argument.slice(separator + 1);

      if (flag === '--set-file') {
        // `--set-file` assigns the file's contents, so the value only exists on disk
        overrides.push({path, value: fs.existsSync(raw) ? fs.readFileSync(raw, 'utf8') : ''});
      } else {
        // only bare `--set` coerces scalars; the literal/string flavours stay verbatim
        overrides.push({path, value: flag === '--set' ? ConsensusNodeValuesTranslator.coerceScalar(raw) : raw});
      }

      index++;
    }

    const merged: AnyObject = ConsensusNodeValuesTranslator.mergeValuesFiles(filePaths);
    for (const {path, value} of overrides) {
      ConsensusNodeValuesTranslator.assignPath(merged, path, value);
    }

    return merged;
  }

  /**
   * Values for the shared release: the umbrella shape with an empty node list.
   *
   * The roster is preserved under `hedera.rosterNodes` because `dns-validation-script` has to probe
   * every node's FQDN — emptying the list alone would render that script with no checks at all.
   */
  public static toSharedValues(umbrella: AnyObject): AnyObject {
    const shared: AnyObject = ConsensusNodeValuesTranslator.deepMerge({}, umbrella);
    const hedera: AnyObject = (shared.hedera as AnyObject) ?? {};
    const nodes: unknown[] = Array.isArray(hedera.nodes) ? (hedera.nodes as unknown[]) : [];
    shared.hedera = {...hedera, nodes: [], rosterNodes: nodes};
    return shared;
  }

  /** Flat values for one node's release, extracted by its `hedera.nodes[].name`. */
  public static toNodeValues(umbrella: AnyObject, nodeName: string): AnyObject {
    const node: AnyObject = ConsensusNodeValuesTranslator.findNode(umbrella, nodeName);
    const defaults: AnyObject = (umbrella.defaults as AnyObject) ?? {};
    const hedera: AnyObject = (umbrella.hedera as AnyObject) ?? {};
    const flat: AnyObject = {};

    for (const key of ConsensusNodeValuesTranslator.PASSTHROUGH_KEYS) {
      if (umbrella[key] !== undefined) {
        flat[key] = umbrella[key];
      }
    }

    for (const key of ConsensusNodeValuesTranslator.LIFTED_DEFAULT_KEYS) {
      if (defaults[key] !== undefined) {
        flat[key] = defaults[key];
      }
    }

    // The sidecars address MinIO by hostname; the tenant itself belongs to the shared release.
    const minioTenantName: string | undefined = ConsensusNodeValuesTranslator.minioTenantName(umbrella);
    if (minioTenantName) {
      const cloud: AnyObject = (flat.cloud as AnyObject) ?? {};
      const minio: AnyObject = (cloud.minio as AnyObject) ?? {};
      flat.cloud = {...cloud, minio: {...minio, tenantName: minioTenantName}};
    }

    if (hedera.initContainers !== undefined) {
      flat.initContainers = hedera.initContainers;
    }

    // Only `applicationEnv` is read by the node's own templates; the remaining configMaps entries
    // render shared ConfigMaps and stay with the shared release.
    const configMaps: AnyObject = (hedera.configMaps as AnyObject) ?? {};
    if (configMaps.applicationEnv !== undefined) {
      flat.configMaps = {applicationEnv: configMaps.applicationEnv};
    }

    // The node's own identity and scheduling overrides sit at the top level.
    for (const [key, value] of Object.entries(node)) {
      if (value !== undefined) {
        flat[key] = value;
      }
    }

    return flat;
  }

  /** Writes `values` as YAML under `directory` and returns the path; the caller owns cleanup. */
  public static writeValuesFile(directory: string, fileName: string, values: AnyObject): string {
    fs.mkdirSync(directory, {recursive: true});
    const filePath: string = PathEx.join(directory, fileName);
    fs.writeFileSync(filePath, yaml.stringify(values));
    return filePath;
  }

  private static findNode(umbrella: AnyObject, nodeName: string): AnyObject {
    const nodes: unknown = (umbrella.hedera as AnyObject)?.nodes;
    const match: AnyObject | undefined = Array.isArray(nodes)
      ? (nodes.find((node: unknown): boolean => (node as AnyObject)?.name === nodeName) as AnyObject | undefined)
      : undefined;

    if (!match) {
      throw new SoloErrors.validation.consensusNodeValuesNodeNotFound(nodeName);
    }

    return match;
  }

  private static minioTenantName(umbrella: AnyObject): string | undefined {
    const minioServer: AnyObject | undefined = umbrella['minio-server'] as AnyObject | undefined;
    const tenant: AnyObject | undefined = minioServer?.tenant as AnyObject | undefined;
    const name: unknown = tenant?.name;
    return typeof name === 'string' && name ? name : undefined;
  }

  /**
   * Writes `value` at a Helm `--set` path such as `hedera.nodes[0].name` or `crds.podLog.enabled`,
   * creating intermediate objects and arrays as needed. Mutates `target`.
   */
  private static assignPath(target: AnyObject, path: string, value: unknown): void {
    // `a.b[0].c` -> ['a', 'b', 0, 'c']
    const segments: Array<string | number> = [];
    for (const part of path.split('.')) {
      const match: RegExpMatchArray | null = part.match(/^([^[]+)((?:\[\d+])+)$/);
      if (!match) {
        segments.push(part);
        continue;
      }

      segments.push(match[1]);
      for (const index of match[2].matchAll(/\[(\d+)]/g)) {
        segments.push(Number(index[1]));
      }
    }

    // A Helm `--set` path is assembled from Solo's own arguments, so this should be unreachable — but
    // walking an attacker-chosen chain onto Object.prototype would corrupt every object in the
    // process, which is too sharp an edge to leave on a generic path-assignment helper.
    if (
      segments.some(
        (segment: string | number): boolean => typeof segment === 'string' && !UserInput.safeJsonKey(segment),
      )
    ) {
      throw new SoloErrors.validation.illegalArgument(`refusing to assign the unsafe values path '${path}'`);
    }

    let cursor: AnyObject | unknown[] = target;
    for (let index: number = 0; index < segments.length - 1; index++) {
      const segment: string | number = segments[index];
      const nextIsIndex: boolean = typeof segments[index + 1] === 'number';
      const existing: unknown = (cursor as AnyObject)[segment];

      if (!existing || typeof existing !== 'object') {
        (cursor as AnyObject)[segment] = nextIsIndex ? [] : {};
      }

      cursor = (cursor as AnyObject)[segment] as AnyObject | unknown[];
    }

    (cursor as AnyObject)[segments.at(-1)] = value;
  }

  /** Mirrors Helm's `--set` scalar coercion; `--set-literal` and `--set-string` bypass this. */
  private static coerceScalar(raw: string): unknown {
    if (raw === 'true' || raw === 'false') {
      return raw === 'true';
    }

    if (raw === 'null') {
      return null;
    }

    return raw !== '' && /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
  }

  /**
   * Deliberately not `ReflectAssist.merge`: that skips `null`/`undefined` source values, and under
   * Helm `--reuse-values` an explicit `null` deletes a key, so dropping it changes what renders.
   */
  private static deepMerge(target: AnyObject, source: AnyObject): AnyObject {
    const result: AnyObject = {...target};

    for (const [key, value] of Object.entries(source)) {
      const existing: unknown = result[key];
      result[key] =
        ConsensusNodeValuesTranslator.isPlainObject(existing) && ConsensusNodeValuesTranslator.isPlainObject(value)
          ? ConsensusNodeValuesTranslator.deepMerge(existing as AnyObject, value as AnyObject)
          : value;
    }

    return result;
  }

  private static isPlainObject(value: unknown): boolean {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
