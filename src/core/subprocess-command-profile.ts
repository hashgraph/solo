// SPDX-License-Identifier: Apache-2.0

/**
 * Identifies which external command a subprocess environment is being built for.
 * Each profile selects a minimal set of environment variables that the corresponding
 * command actually needs (see {@link SubprocessEnvironment}).
 */
export enum SubprocessCommandProfile {
  GENERIC = 'generic',
  KUBECTL = 'kubectl',
  HELM = 'helm',
  KIND = 'kind',
  CONTAINER_ENGINE = 'container-engine',
  BREW = 'brew',
  NPM = 'npm',
  GITHUB_CLI = 'github-cli',
}
