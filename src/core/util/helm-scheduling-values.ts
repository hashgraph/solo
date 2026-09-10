// SPDX-License-Identifier: Apache-2.0

import * as fs from 'node:fs';
import {ValuesFileParser} from './values-file-parser.js';
import {HelmChartValues, type HelmChartValue} from '../../integration/helm/model/values.js';
import {type HelmSchedulingValueFallback} from './helm-scheduling-value-fallback.js';
import {type HelmSchedulingValueMapping} from './helm-scheduling-value-mapping.js';

type HelmValuesObject = Record<string, unknown>;
type HelmMapValue = SchedulingValues['nodeSelector'];
type HelmToleration = SchedulingValues['tolerations'][number];

interface SchedulingValues {
  nodeSelector: Record<string, HelmChartValue>;
  tolerations: Record<string, HelmChartValue>[];
}

export class HelmSchedulingValues {
  public static buildSchedulingChartValues(
    sourceChartValues: HelmChartValues,
    targetPath: string,
    sourcePath?: string,
  ): HelmChartValues {
    return HelmSchedulingValues.buildMappedSchedulingChartValues(sourceChartValues, [
      {
        sourcePaths: sourcePath === undefined ? [] : [sourcePath],
        targetPaths: [targetPath],
      },
    ]);
  }

  public static buildMappedSchedulingChartValues(
    sourceChartValues: HelmChartValues,
    mappings: HelmSchedulingValueMapping[],
  ): HelmChartValues {
    const chartValues: HelmChartValues = new HelmChartValues();
    const valuesObjects: HelmValuesObject[] = HelmSchedulingValues.readHelmValuesObjects(sourceChartValues);

    for (const mapping of mappings) {
      const schedulingValues: SchedulingValues = HelmSchedulingValues.collectSchedulingValues(
        valuesObjects,
        mapping.sourcePaths ?? [],
        mapping.includeTopLevel ?? true,
      );

      if (mapping.fallback) {
        HelmSchedulingValues.addMissingFallbackScheduling(schedulingValues, valuesObjects, mapping.fallback);
      }

      for (const targetPath of mapping.targetPaths) {
        HelmSchedulingValues.addSchedulingValues(chartValues, targetPath, schedulingValues);
      }
    }

    return chartValues;
  }

  private static collectSchedulingValues(
    valuesObjects: HelmValuesObject[],
    sourcePaths: string[],
    includeTopLevel: boolean,
  ): SchedulingValues {
    const schedulingValues: SchedulingValues = HelmSchedulingValues.createSchedulingValues();

    for (const values of valuesObjects) {
      HelmSchedulingValues.mergeSchedulingValues(schedulingValues, values, sourcePaths, includeTopLevel);
    }

    return schedulingValues;
  }

  private static createSchedulingValues(): SchedulingValues {
    return {
      nodeSelector: {},
      tolerations: [],
    };
  }

  private static readHelmValuesObjects(chartValues: HelmChartValues): HelmValuesObject[] {
    return HelmSchedulingValues.getValuesFilePaths(chartValues)
      .map((valuesFilePath: string): unknown =>
        ValuesFileParser.parse(valuesFilePath, fs.readFileSync(valuesFilePath, 'utf8')),
      )
      .filter((values: unknown): values is HelmValuesObject => HelmSchedulingValues.isHelmValuesObject(values));
  }

  private static getValuesFilePaths(chartValues: HelmChartValues): string[] {
    const arguments_: string[] = chartValues.toArguments();
    const valuesFilePaths: string[] = [];

    for (let index: number = 0; index < arguments_.length - 1; index++) {
      if (arguments_[index] === '--values') {
        valuesFilePaths.push(arguments_[index + 1]);
      }
    }

    return valuesFilePaths;
  }

  private static mergeSchedulingValues(
    target: SchedulingValues,
    values: HelmValuesObject,
    sourcePaths: string[],
    includeTopLevel: boolean,
  ): void {
    if (includeTopLevel) {
      HelmSchedulingValues.mergeSchedulingValuesFromPath(target, values, '');
    }

    for (const sourcePath of sourcePaths) {
      HelmSchedulingValues.mergeSchedulingValuesFromPath(target, values, sourcePath);
    }
  }

  private static mergeSchedulingValuesFromPath(
    target: SchedulingValues,
    values: HelmValuesObject,
    sourcePath: string,
  ): void {
    const pathPrefix: string = sourcePath === '' ? '' : `${sourcePath}.`;

    Object.assign(target.nodeSelector, HelmSchedulingValues.getMapValue(values, `${pathPrefix}nodeSelector`));
    HelmSchedulingValues.addTolerations(
      target.tolerations,
      HelmSchedulingValues.getTolerations(values, `${pathPrefix}tolerations`),
    );
  }

  private static getMapValue(values: HelmValuesObject, path: string): HelmMapValue {
    const value: unknown = HelmSchedulingValues.getValueAtPath(values, path);
    if (!HelmSchedulingValues.isHelmValuesObject(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter((entry: [string, unknown]): entry is [string, HelmChartValue] =>
        HelmSchedulingValues.isHelmChartValue(entry[1]),
      ),
    );
  }

  private static getTolerations(values: HelmValuesObject, path: string): HelmToleration[] {
    const value: unknown = HelmSchedulingValues.getValueAtPath(values, path);
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((toleration: unknown): toleration is HelmValuesObject =>
        HelmSchedulingValues.isHelmValuesObject(toleration),
      )
      .map((toleration: HelmValuesObject): HelmToleration =>
        Object.fromEntries(
          Object.entries(toleration).filter((entry: [string, unknown]): entry is [string, HelmChartValue] =>
            HelmSchedulingValues.isHelmChartValue(entry[1]),
          ),
        ),
      )
      .filter((toleration: HelmToleration): boolean => Object.keys(toleration).length > 0);
  }

  private static getValueAtPath(values: HelmValuesObject, path: string): unknown {
    let currentValue: unknown = values;

    for (const segment of path.split('.')) {
      if (!HelmSchedulingValues.isHelmValuesObject(currentValue)) {
        return undefined;
      }

      currentValue = currentValue[segment];
    }

    return currentValue;
  }

  private static addTolerations(target: HelmToleration[], tolerations: HelmToleration[]): void {
    const existing: Set<string> = new Set(
      target.map((toleration: HelmToleration): string => JSON.stringify(toleration)),
    );

    for (const toleration of tolerations) {
      const serialized: string = JSON.stringify(toleration);
      if (!existing.has(serialized)) {
        target.push(toleration);
        existing.add(serialized);
      }
    }
  }

  private static addMissingFallbackScheduling(
    target: SchedulingValues,
    valuesObjects: HelmValuesObject[],
    fallback: HelmSchedulingValueFallback,
  ): void {
    for (const sourcePath of fallback.sourcePaths) {
      const fallbackSchedulingValues: SchedulingValues = HelmSchedulingValues.collectSchedulingValues(
        valuesObjects,
        [sourcePath],
        false,
      );

      if (target.nodeSelector[fallback.key] === undefined) {
        const selectorValue: HelmChartValue | undefined = fallbackSchedulingValues.nodeSelector[fallback.key];
        if (selectorValue !== undefined) {
          target.nodeSelector[fallback.key] = selectorValue;
        }
      }

      if (!HelmSchedulingValues.hasTolerationForKey(target.tolerations, fallback.key)) {
        const toleration: HelmToleration | undefined = fallbackSchedulingValues.tolerations.find(
          (candidate: HelmToleration): boolean => candidate.key === fallback.key,
        );
        if (toleration) {
          target.tolerations.push(toleration);
        }
      }

      if (
        target.nodeSelector[fallback.key] !== undefined &&
        HelmSchedulingValues.hasTolerationForKey(target.tolerations, fallback.key)
      ) {
        return;
      }
    }
  }

  private static hasTolerationForKey(tolerations: HelmToleration[], key: string): boolean {
    return tolerations.some((toleration: HelmToleration): boolean => toleration.key === key);
  }

  private static addSchedulingValues(
    chartValues: HelmChartValues,
    targetPath: string,
    schedulingValues: SchedulingValues,
  ): void {
    const nodeSelectorPath: string = `${targetPath}.nodeSelector`;
    const tolerationsPath: string = `${targetPath}.tolerations`;

    for (const [key, value] of Object.entries(schedulingValues.nodeSelector)) {
      chartValues.setString(`${nodeSelectorPath}.${HelmSchedulingValues.escapeHelmPathSegment(key)}`, value);
    }

    for (const [index, toleration] of schedulingValues.tolerations.entries()) {
      for (const [key, value] of Object.entries(toleration)) {
        chartValues.setLiteral(`${tolerationsPath}[${index}].${key}`, value);
      }
    }
  }

  private static escapeHelmPathSegment(segment: string): string {
    return segment.replaceAll('.', String.raw`\.`);
  }

  private static isHelmValuesObject(value: unknown): value is HelmValuesObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static isHelmChartValue(value: unknown): value is HelmChartValue {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  }
}
