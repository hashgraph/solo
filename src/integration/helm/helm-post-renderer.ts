// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import {PathEx} from '../../business/utils/path-ex.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';
import {SoloErrors} from '../../core/errors/solo-errors.js';
import {HelmChartValues} from './model/values.js';

/**
 * Generates Helm post-renderers.
 *
 * A post-renderer sits between Helm rendering a chart and Helm applying the result: Helm pipes the
 * rendered manifests to the post-renderer's stdin and applies whatever it writes to stdout.
 *
 * Helm 3 takes the path of an executable for `--post-renderer`. Helm 4 only takes the name of an installed
 * plugin of type `postrenderer/v1`, so for Helm 4 the same script is wrapped in a plugin that Helm finds
 * through the `HELM_PLUGINS` environment variable, which spares installing anything into the user's Helm home.
 */
export class HelmPostRenderer {
  private static readonly SAFE_LITERAL: RegExp = /^[\w-]+$/;
  private static readonly PLUGIN_NAME: string = 'solo-replace';

  /**
   * Creates the chart values that make Helm replace every occurrence of `from` with `to` in the rendered manifests.
   * Used to rename resources whose names a chart hardcodes, so that several releases of the chart can share a namespace.
   *
   * @param directory - the directory the post-renderer files are written to
   * @param helmMajorVersion - the major version of the Helm CLI that will run the chart
   * @param from - the literal to replace; only letters, digits, `_` and `-` are accepted
   * @param to - the replacement; only letters, digits, `_` and `-` are accepted
   */
  public static replacer(directory: string, helmMajorVersion: number, from: string, to: string): HelmChartValues {
    for (const literal of [from, to]) {
      if (!HelmPostRenderer.SAFE_LITERAL.test(literal)) {
        throw new SoloErrors.validation.illegalArgument(
          `Post-renderer literal '${literal}' must only contain letters, digits, '_' and '-'`,
        );
      }
    }

    const chartValues: HelmChartValues = new HelmChartValues();
    if (helmMajorVersion >= 4) {
      const pluginsDirectory: string = PathEx.join(directory, 'plugins');
      HelmPostRenderer.writePlugin(PathEx.join(pluginsDirectory, HelmPostRenderer.PLUGIN_NAME));
      chartValues
        .environmentVariable('HELM_PLUGINS', pluginsDirectory)
        .arguments('--post-renderer', HelmPostRenderer.PLUGIN_NAME);
    } else {
      chartValues.arguments('--post-renderer', HelmPostRenderer.writeScript(directory));
    }

    return chartValues.arguments('--post-renderer-args', from, '--post-renderer-args', to);
  }

  /** Writes the Helm 4 plugin that runs the replace script. */
  private static writePlugin(pluginDirectory: string): void {
    HelmPostRenderer.writeScript(pluginDirectory);
    fs.writeFileSync(
      PathEx.join(pluginDirectory, 'plugin.yaml'),
      [
        `name: "${HelmPostRenderer.PLUGIN_NAME}"`,
        'version: "1.0.0"',
        'type: postrenderer/v1',
        'apiVersion: v1',
        'runtime: subprocess',
        'runtimeConfig:',
        '  platformCommand:',
        '    - os: windows',
        '      command: "${HELM_PLUGIN_DIR}/replace.cmd"',
        '    - command: "${HELM_PLUGIN_DIR}/replace.sh"',
        '',
      ].join('\n'),
    );
  }

  /**
   * Writes the script that replaces its first argument with its second in whatever it reads from stdin.
   * @returns the path of the script
   */
  private static writeScript(directory: string): string {
    fs.mkdirSync(directory, {recursive: true});

    if (OperatingSystem.isWin32()) {
      const path: string = PathEx.join(directory, 'replace.cmd');
      fs.writeFileSync(
        path,
        [
          '@echo off',
          'powershell -NoProfile -NonInteractive -Command "& { param($from,$to) [Console]::In.ReadToEnd() -replace $from,$to } %1 %2"',
          '',
        ].join('\r\n'),
      );
      return path;
    }

    const path: string = PathEx.join(directory, 'replace.sh');
    fs.writeFileSync(path, '#!/bin/sh\nexec sed "s/$1/$2/g"\n', {mode: 0o755});
    fs.chmodSync(path, 0o755);
    return path;
  }
}
