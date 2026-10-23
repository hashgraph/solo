// SPDX-License-Identifier: Apache-2.0

import {HelmChartSchema} from '../common/helm-chart-schema.js';
import {TssSchema} from './tss-schema.js';
import {SubprocessSchema} from './subprocess-schema.js';
import {Exclude, Expose, Type} from 'class-transformer';
import {SemanticVersion} from '../../../../business/utils/semantic-version.js';

@Exclude()
export class SoloConfigSchema {
  public static readonly SCHEMA_VERSION: SemanticVersion<number> = new SemanticVersion(1);
  public static readonly EMPTY: SoloConfigSchema = new SoloConfigSchema(SoloConfigSchema.SCHEMA_VERSION.major);

  @Expose()
  public schemaVersion: number;

  @Expose()
  @Type((): typeof HelmChartSchema => HelmChartSchema)
  public helmChart: HelmChartSchema;

  @Expose()
  @Type((): typeof HelmChartSchema => HelmChartSchema)
  public ingressControllerHelmChart: HelmChartSchema;

  @Expose()
  @Type((): typeof HelmChartSchema => HelmChartSchema)
  public clusterSetupHelmChart: HelmChartSchema;

  @Expose()
  @Type((): typeof HelmChartSchema => HelmChartSchema)
  public certManagerHelmChart: HelmChartSchema;

  @Expose()
  @Type((): typeof HelmChartSchema => HelmChartSchema)
  public blockNodeHelmChart: HelmChartSchema;

  @Expose()
  @Type((): typeof HelmChartSchema => HelmChartSchema)
  public explorerHelmChart: HelmChartSchema;

  @Expose()
  @Type((): typeof HelmChartSchema => HelmChartSchema)
  public mirrorNodeHelmChart: HelmChartSchema;

  @Expose()
  @Type((): typeof HelmChartSchema => HelmChartSchema)
  public relayHelmChart: HelmChartSchema;

  @Expose()
  @Type((): typeof TssSchema => TssSchema)
  public tss: TssSchema;

  @Expose()
  @Type((): typeof SubprocessSchema => SubprocessSchema)
  public subprocess: SubprocessSchema;

  public constructor(
    schemaVersion?: number,
    helmChart?: HelmChartSchema,
    ingressControllerHelmChart?: HelmChartSchema,
    clusterSetupHelmChart?: HelmChartSchema,
    certManagerHelmChart?: HelmChartSchema,
    tss?: TssSchema,
    subprocess?: SubprocessSchema,
    blockNodeHelmChart?: HelmChartSchema,
    explorerHelmChart?: HelmChartSchema,
    mirrorNodeHelmChart?: HelmChartSchema,
    relayHelmChart?: HelmChartSchema,
  ) {
    this.schemaVersion = schemaVersion ?? 1;
    this.helmChart = helmChart || new HelmChartSchema();
    this.ingressControllerHelmChart = ingressControllerHelmChart || new HelmChartSchema();
    this.clusterSetupHelmChart = clusterSetupHelmChart || new HelmChartSchema();
    this.certManagerHelmChart = certManagerHelmChart || new HelmChartSchema();
    this.blockNodeHelmChart = blockNodeHelmChart || new HelmChartSchema();
    this.explorerHelmChart = explorerHelmChart || new HelmChartSchema();
    this.mirrorNodeHelmChart = mirrorNodeHelmChart || new HelmChartSchema();
    this.relayHelmChart = relayHelmChart || new HelmChartSchema();
    this.tss = tss || new TssSchema();
    this.subprocess = subprocess || new SubprocessSchema();
  }
}
