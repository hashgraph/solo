// SPDX-License-Identifier: Apache-2.0

import {instanceToPlain, plainToInstance} from 'class-transformer';
import {type Facade} from '../../facade/facade.js';
import {SoloConfigSchema} from '../../../../data/schema/model/solo/solo-config-schema.js';
import {HelmChart} from '../common/helm-chart.js';
import {Tss} from './tss.js';
import {Subprocess} from './subprocess.js';
import {type ConfigProvider} from '../../../../data/configuration/api/config-provider.js';

export class SoloConfig implements Facade<SoloConfigSchema> {
  public readonly encapsulatedObject: SoloConfigSchema;

  private readonly _helmChart: HelmChart;
  private readonly _ingressControllerHelmChart: HelmChart;
  private readonly _clusterSetupHelmChart: HelmChart;
  private readonly _certManagerHelmChart: HelmChart;
  private readonly _tss: Tss;
  private readonly _subprocess: Subprocess;

  public constructor(schema: SoloConfigSchema) {
    // Deep copy for immutability — prevents callers from mutating projected config through the schema ref
    this.encapsulatedObject = plainToInstance(SoloConfigSchema, instanceToPlain(schema ?? new SoloConfigSchema()));
    this._helmChart = new HelmChart(this.encapsulatedObject.helmChart);
    this._ingressControllerHelmChart = new HelmChart(this.encapsulatedObject.ingressControllerHelmChart);
    this._clusterSetupHelmChart = new HelmChart(this.encapsulatedObject.clusterSetupHelmChart);
    this._certManagerHelmChart = new HelmChart(this.encapsulatedObject.certManagerHelmChart);
    this._tss = new Tss(this.encapsulatedObject.tss);
    this._subprocess = new Subprocess(this.encapsulatedObject.subprocess);
  }

  public static getConfig(configProvider: ConfigProvider): SoloConfig {
    return new SoloConfig(configProvider.config().asObject(SoloConfigSchema));
  }

  public get helmChart(): HelmChart {
    return this._helmChart;
  }

  public get ingressControllerHelmChart(): HelmChart {
    return this._ingressControllerHelmChart;
  }

  public get clusterSetupHelmChart(): HelmChart {
    return this._clusterSetupHelmChart;
  }

  public get certManagerHelmChart(): HelmChart {
    return this._certManagerHelmChart;
  }

  public get tss(): Tss {
    return this._tss;
  }

  public get subprocess(): Subprocess {
    return this._subprocess;
  }
}
