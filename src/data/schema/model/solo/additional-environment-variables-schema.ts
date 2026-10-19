// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose} from 'class-transformer';

/**
 * Extra environment variable names to forward to external commands, declared per command so the
 * allowlist's per-command containment is preserved.
 *
 * A variable an exec credential plugin needs has no business reaching `npm` or a container engine,
 * so there is deliberately no "all commands" list. Each field corresponds to one
 * `SubprocessCommandProfile`.
 */
@Exclude()
export class AdditionalEnvironmentVariablesSchema {
  @Expose()
  public generic: string[];

  @Expose()
  public kubectl: string[];

  @Expose()
  public helm: string[];

  @Expose()
  public kind: string[];

  @Expose()
  public containerEngine: string[];

  @Expose()
  public brew: string[];

  @Expose()
  public npm: string[];

  @Expose()
  public githubCli: string[];

  public constructor(
    generic?: string[],
    kubectl?: string[],
    helm?: string[],
    kind?: string[],
    containerEngine?: string[],
    brew?: string[],
    npm?: string[],
    githubCli?: string[],
  ) {
    this.generic = generic ?? [];
    this.kubectl = kubectl ?? [];
    this.helm = helm ?? [];
    this.kind = kind ?? [];
    this.containerEngine = containerEngine ?? [];
    this.brew = brew ?? [];
    this.npm = npm ?? [];
    this.githubCli = githubCli ?? [];
  }
}
