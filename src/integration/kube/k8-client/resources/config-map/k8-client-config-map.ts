// SPDX-License-Identifier: Apache-2.0

import {V1ConfigMap, V1ObjectMeta} from '@kubernetes/client-node';
import {type ConfigMap} from '../../../resources/config-map/config-map.js';
import {NamespaceName} from '../../../resources/namespace/namespace-name.js';

export class K8ClientConfigMap implements ConfigMap {
  public constructor(
    public readonly namespace: NamespaceName,
    public readonly name: string,
    public readonly labels?: Record<string, string>,
    public readonly data?: Record<string, string>,
  ) {}

  public static fromV1ConfigMap(v1ConfigMap: V1ConfigMap): ConfigMap {
    return new K8ClientConfigMap(
      NamespaceName.of(v1ConfigMap.metadata.namespace),
      v1ConfigMap.metadata.name,
      v1ConfigMap.metadata.labels,
      v1ConfigMap.data,
    );
  }

  public static toV1ConfigMap(configMap: ConfigMap): V1ConfigMap {
    const v1ConfigMap: V1ConfigMap = new V1ConfigMap();
    v1ConfigMap.metadata = new V1ObjectMeta();
    v1ConfigMap.metadata.name = configMap.name;
    v1ConfigMap.metadata.namespace = configMap.namespace.name;
    v1ConfigMap.metadata.labels = configMap.labels;
    v1ConfigMap.data = configMap.data;
    return v1ConfigMap;
  }
}
