// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform} from 'class-transformer';
import {SemVer} from 'semver';
import {Transformations} from '../utils/transformations.js';

@Exclude()
export class ApplicationVersions {
  @Expose()
  @Transform(Transformations.SemVer)
  public cli: SemVer;

  @Expose()
  @Transform(Transformations.SemVer)
  public chart: SemVer;

  @Expose()
  @Transform(Transformations.SemVer)
  public consensusNode: SemVer;

  @Expose()
  @Transform(Transformations.SemVer)
  public mirrorNodeChart: SemVer;

  @Expose()
  @Transform(Transformations.SemVer)
  public explorerChart: SemVer;

  @Expose()
  @Transform(Transformations.SemVer)
  public jsonRpcRelayChart: SemVer;

  @Expose()
  @Transform(Transformations.SemVer)
  public blockNodeChart: SemVer;

  public constructor(
    cli?: SemVer,
    chart?: SemVer,
    consensusNode?: SemVer,
    mirrorNodeChart?: SemVer,
    explorerChart?: SemVer,
    jsonRpcRelayChart?: SemVer,
    blockNodeChart?: SemVer,
  ) {
    this.cli = cli ?? new SemVer('0.0.0');
    this.chart = chart ?? new SemVer('0.0.0');
    this.consensusNode = consensusNode ?? new SemVer('0.0.0');
    this.mirrorNodeChart = mirrorNodeChart ?? new SemVer('0.0.0');
    this.explorerChart = explorerChart ?? new SemVer('0.0.0');
    this.jsonRpcRelayChart = jsonRpcRelayChart ?? new SemVer('0.0.0');
    this.blockNodeChart = blockNodeChart ?? new SemVer('0.0.0');
  }
}
