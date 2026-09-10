// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import path from 'node:path';
import * as constants from '../../core/constants.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type K8} from '../../integration/kube/k8.js';
import {type Contexts} from '../../integration/kube/resources/context/contexts.js';
import {type ConfigMap} from '../../integration/kube/resources/config-map/config-map.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';

export class RemoteConfigCollector {
  public constructor(
    private readonly k8Factory: K8Factory,
    private readonly logger: SoloLogger,
  ) {}

  /**
   * Sanitize a string for safe use as a filename on all platforms.
   * Replaces characters invalid on Windows with underscores.
   */
  private sanitizeFilename(input: string): string {
    return input.replaceAll(/[^A-Za-z0-9._-]/g, '_');
  }

  public async collect(
    customOutputDirectory: string = '',
    scopedContexts?: string[],
    scopedNamespace?: NamespaceName,
  ): Promise<string> {
    const outputDirectory: string = customOutputDirectory
      ? path.resolve(customOutputDirectory, 'remote-config')
      : PathEx.join(constants.SOLO_LOGS_DIR, 'remote-config');
    fs.mkdirSync(outputDirectory, {recursive: true});

    const contexts: Contexts = this.k8Factory.default().contexts();
    const allowedContexts: ReadonlySet<string> | undefined = scopedContexts
      ? new Set<string>(scopedContexts)
      : undefined;
    const contextList: string[] =
      allowedContexts === undefined
        ? contexts.list()
        : contexts.list().filter((context): boolean => allowedContexts.has(context));
    for (const context of contextList) {
      const k8: K8 = this.k8Factory.getK8(context);
      try {
        const configMaps: ConfigMap[] =
          scopedNamespace === undefined
            ? await k8.configMaps().listForAllNamespaces([constants.SOLO_REMOTE_CONFIGMAP_LABEL_SELECTOR])
            : await k8.configMaps().list(scopedNamespace, [constants.SOLO_REMOTE_CONFIGMAP_LABEL_SELECTOR]);

        for (const configMap of configMaps) {
          const namespace: string = configMap.namespace.name;
          const outputFileName: string = `${this.sanitizeFilename(context)}-${this.sanitizeFilename(namespace)}-${this.sanitizeFilename(configMap.name)}.json`;
          const outputFilePath: string = PathEx.join(outputDirectory, outputFileName);

          fs.writeFileSync(
            outputFilePath,
            JSON.stringify(this.toSerializableConfigMap(configMap), undefined, 2),
            'utf8',
          );
          this.logger.info(`Saved solo-remote-config for ${context}/${namespace} to ${outputFilePath}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to get solo-remote-config in context ${context}: ${(error as Error).message}`);
      }
    }

    return outputDirectory;
  }

  private toSerializableConfigMap(configMap: ConfigMap): Record<string, unknown> {
    const output: Record<string, unknown> = {
      name: configMap.name,
      namespace: configMap.namespace.name,
      labels: configMap.labels ?? {},
      data: {} as Record<string, unknown>,
    };

    if (configMap.data) {
      for (const [key, value] of Object.entries(configMap.data)) {
        try {
          (output.data as Record<string, unknown>)[key] = JSON.parse(value);
        } catch {
          (output.data as Record<string, unknown>)[key] = value;
        }
      }
    }

    return output;
  }
}
