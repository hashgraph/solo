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
  ) {
    this.schemaVersion = schemaVersion ?? 1;
    this.helmChart = helmChart || new HelmChartSchema();
    this.ingressControllerHelmChart = ingressControllerHelmChart || new HelmChartSchema();
    this.clusterSetupHelmChart = clusterSetupHelmChart || new HelmChartSchema();
    this.certManagerHelmChart = certManagerHelmChart || new HelmChartSchema();
    this.tss = tss || new TssSchema();
    this.subprocess = subprocess || new SubprocessSchema();
  }
}
