// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import os from 'node:os';
import {ShellRunner} from '../shell-runner.js';
import {SubprocessCommandProfile} from '../subprocess-command-profile.js';
import {SubprocessEnvironment} from '../subprocess-environment.js';
import {type PackageManager} from './package-manager.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {getEnvironmentVariable} from '../constants.js';
import {injectable} from 'tsyringe-neo';

@injectable()
export class BrewPackageManager extends ShellRunner implements PackageManager {
  private static readonly INSTALL_SCRIPT_URL: string =
    'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh';
  private static readonly UNINSTALL_SCRIPT_URL: string =
    'https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh';
  private static readonly LINUXBREW_BIN: string = '/home/linuxbrew/.linuxbrew/bin';

  // Homebrew does not require sudo elevation; the sudo callbacks are no-ops so that
  // BrewPackageManager satisfies the PackageManager contract used across platforms.
  public setOnSudoRequested(_callback: (message: string) => void): void {
    void _callback;
  }

  public setOnSudoGranted(_callback: (message: string) => void): void {
    void _callback;
  }

  public async installPackages(dependencies: string[]): Promise<void> {
    await this.run('brew', ['install', ...dependencies], {commandProfile: SubprocessCommandProfile.BREW});
  }

  public async uninstallPackages(dependencies: string[]): Promise<void> {
    await this.run('brew', ['uninstall', ...dependencies], {commandProfile: SubprocessCommandProfile.BREW});
  }

  public async update(): Promise<void> {
    await this.run('brew', ['update'], {commandProfile: SubprocessCommandProfile.BREW});
  }

  public async upgrade(dependencies: string[]): Promise<void> {
    await this.run('brew', ['upgrade', ...dependencies], {commandProfile: SubprocessCommandProfile.BREW});
  }

  public async install(): Promise<boolean> {
    await this.runHomebrewScript(BrewPackageManager.INSTALL_SCRIPT_URL);
    await this.applyShellEnvironment();
    SubprocessEnvironment.appendSessionPath(BrewPackageManager.LINUXBREW_BIN);
    return this.isAvailable();
  }

  public async uninstall(): Promise<void> {
    await this.runHomebrewScript(BrewPackageManager.UNINSTALL_SCRIPT_URL);
  }

  public async isAvailable(): Promise<boolean> {
    try {
      await this.run('brew', ['--version'], {commandProfile: SubprocessCommandProfile.BREW});
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Downloads a Homebrew install/uninstall script and runs it with bash, without invoking a shell to
   * perform command substitution (replaces the previous `bash -c "$(curl …)"` pattern).
   */
  private async runHomebrewScript(scriptUrl: string): Promise<void> {
    const temporaryDirectory: string = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-brew-'));
    const scriptPath: string = PathEx.join(temporaryDirectory, 'homebrew.sh');
    try {
      await this.run('curl', ['-fsSL', scriptUrl, '-o', scriptPath]);
      await this.run('bash', [scriptPath], {
        verbose: true,
        commandProfile: SubprocessCommandProfile.BREW,
        environmentVariablesToAppend: {NONINTERACTIVE: '1'},
      });
    } finally {
      // Remove the whole temp directory created by mkdtempSync, not just the script file.
      fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    }
  }

  /**
   * Applies the environment that `brew shellenv` would export, without a shell `eval`. Parses the
   * `export KEY="VALUE";` lines and expands the shell parameter references each value contains.
   * The values are registered as session environment state for subsequent spawned commands
   * instead of mutating the global `process.env`.
   */
  private async applyShellEnvironment(): Promise<void> {
    const output: string[] = await this.run(`${BrewPackageManager.LINUXBREW_BIN}/brew`, ['shellenv'], {
      commandProfile: SubprocessCommandProfile.BREW,
    });
    for (const line of output) {
      const match: RegExpMatchArray | null = line.match(/^export ([A-Za-z_]\w*)="(.*)";?$/);
      if (!match) {
        continue;
      }
      const [, key, rawValue]: string[] = match;
      if (key === 'PATH') {
        BrewPackageManager.registerPathAdditions(rawValue);
      } else {
        SubprocessEnvironment.setSessionVariable(key, BrewPackageManager.expandShellValue(rawValue));
      }
    }
  }

  /**
   * Registers the new directories from a raw shellenv `PATH` value as session path prepends, preserving order.
   * References to the existing PATH are dropped, never expanded and re-split on the `:` brew hardcodes.
   */
  private static registerPathAdditions(rawPathValue: string): void {
    const literalValue: string = rawPathValue.replaceAll(/\$(\{PATH[^}]*\}|PATH\b)/g, '');
    const currentSegments: Set<string> = new Set<string>(SubprocessEnvironment.currentPath().split(PathEx.delimiter));
    const newSegments: string[] = BrewPackageManager.expandShellValue(literalValue)
      .split(':')
      .filter((segment: string): boolean => Boolean(segment) && !currentSegments.has(segment));
    // prependSessionPath puts each directory in front, so iterate in reverse to preserve order.
    newSegments.reverse();
    for (const segment of newSegments) {
      SubprocessEnvironment.prependSessionPath(segment);
    }
  }

  /**
   * Expands the shell parameter references that `brew shellenv` emits against the current environment, so
   * the values are correct without a shell performing the expansion. brew uses three forms — `${VAR+:$VAR}`
   * (PATH, MANPATH), `${VAR:-}` (INFOPATH) and bare `$VAR` — and hardcodes `:` as the separator, so the
   * literal separators it emits are preserved as-is.
   */
  private static expandShellValue(rawValue: string): string {
    return (
      rawValue
        // ${VAR+word}: substitute word only when VAR is set (brew uses ":$VAR" as the word).
        .replaceAll(/\$\{(\w+)\+([^}]*)\}/g, (_match: string, name: string, word: string): string =>
          getEnvironmentVariable(name) === undefined ? '' : BrewPackageManager.expandShellValue(word),
        )
        // ${VAR:-default}: VAR when set and non-empty, otherwise the default.
        .replaceAll(
          /\$\{(\w+):-([^}]*)\}/g,
          (_match: string, name: string, fallback: string): string =>
            getEnvironmentVariable(name) || BrewPackageManager.expandShellValue(fallback),
        )
        // $VAR or ${VAR}: direct substitution.
        .replaceAll(/\$\{?(\w+)\}?/g, (_match: string, name: string): string => getEnvironmentVariable(name) ?? '')
    );
  }
}
