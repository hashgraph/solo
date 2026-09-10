// SPDX-License-Identifier: Apache-2.0

/**
 * User-supplied answers collected by the falcon prepare wizard that drive
 * the generated falcon-values.yaml file.
 *
 * Note: `enableDevChartMode` maps to the helm-chart `--dev` flag used by
 * `setup` and `blockNode` sections (enables local-build / debug paths).
 * It is intentionally **not** the same as `Flags.debugMode`, which is a
 * logger verbosity toggle — see `SoloPinoLogger.setDevMode`.
 */
export interface FalconPrepareConfig {
  numberOfConsensusNodes: number;
  releaseTag: string;
  mirrorNodeVersion: string;
  relayReleaseTag: string;
  chartVersion: string;
  explorerVersion: string;
  soloChartVersion: string;
  loadBalancerEnabled: boolean;
  enableMirrorIngress: boolean;
  localBuildPath: string;
  debugNodeAlias: string;
  enableDevChartMode: boolean;
  forcePortForward: boolean;
  outputPath: string;
}
