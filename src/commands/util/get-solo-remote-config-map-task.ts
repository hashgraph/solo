// SPDX-License-Identifier: Apache-2.0

import {type AnyListrContext} from '../../types/aliases.js';
import {type SoloListrTask} from '../../types/index.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {RemoteConfigCollector} from './remote-config-collector.js';

export class GetSoloRemoteConfigMapTask {
  public static getTask(
    k8Factory: K8Factory,
    logger: SoloLogger,
    customOutputDirectory: string = '',
    scopeToSelectedDeployment: boolean = false,
  ): SoloListrTask<AnyListrContext> {
    return {
      title: scopeToSelectedDeployment
        ? 'Get solo-remote-config ConfigMaps for selected deployment'
        : 'Get solo-remote-config ConfigMaps from all clusters',
      task: async (context_: AnyListrContext): Promise<void> => {
        const outputDirectory: string = await new RemoteConfigCollector(k8Factory, logger).collect(
          customOutputDirectory,
          scopeToSelectedDeployment ? context_?.config?.contexts : undefined,
          scopeToSelectedDeployment ? context_?.config?.namespace : undefined,
        );
        logger.showUser(`Remote config saved to ${outputDirectory}`);
      },
    };
  }
}
