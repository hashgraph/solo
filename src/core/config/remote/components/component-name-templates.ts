// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../../errors/solo-error.js';
import {type ComponentName} from '../types.js';
import {type NodeAlias} from '../../../../types/aliases.js';

export class ComponentNameTemplates {
  private static RELAY_BASE_NAME: string = 'relay';
  private static EXPLORER_BASE_NAME: string = 'mirror-node-explorer';
  private static MIRROR_NODE_BASE_NAME: string = 'mirror-node';
  private static HA_PROXY_BASE_NAME: (nodeAlias: NodeAlias) => string = nodeAlias => `haproxy-${nodeAlias}`;
  private static ENVOY_PROXY_BASE_NAME: (nodeAlias: NodeAlias) => string = nodeAlias => `envoy-proxy-${nodeAlias}`;

  public static renderRelayName(index: number): ComponentName {
    return ComponentNameTemplates.renderComponentName(ComponentNameTemplates.RELAY_BASE_NAME, index);
  }

  public static renderMirrorNodeExplorerName(index: number): ComponentName {
    return ComponentNameTemplates.renderComponentName(ComponentNameTemplates.EXPLORER_BASE_NAME, index);
  }

  public static renderMirrorNodeName(index: number): ComponentName {
    return ComponentNameTemplates.renderComponentName(ComponentNameTemplates.MIRROR_NODE_BASE_NAME, index);
  }

  public static renderHaProxyName(index: number, nodeAlias: NodeAlias): ComponentName {
    return ComponentNameTemplates.renderComponentName(ComponentNameTemplates.HA_PROXY_BASE_NAME(nodeAlias), index);
  }

  public static renderEnvoyProxyName(index: number, nodeAlias: NodeAlias): ComponentName {
    return ComponentNameTemplates.renderComponentName(ComponentNameTemplates.ENVOY_PROXY_BASE_NAME(nodeAlias), index);
  }

  /**
   * Used for rendering component name with additional data.
   *
   * @param baseName - unique name for the component ( ex. mirror-node )
   * @param index - total number of components from this kind
   * @returns a unique name to be used for creating components
   */
  private static renderComponentName(baseName: string, index: number): ComponentName {
    return `${baseName}-${index}`;
  }

  /**
   * Extracts the index from a component name by splitting on '-' and taking the last segment.
   *
   * @param name - full component name (e.g., "mirror-node-node1-42")
   * @returns the numeric index (e.g., 42)
   */
  public static parseComponentName(name: ComponentName): number {
    const parts: string[] = name.split('-');
    const lastPart: string = parts.at(-1);
    const componentIndex: number = Number.parseInt(lastPart, 10);

    if (Number.isNaN(componentIndex)) {
      throw new SoloError(`Invalid component index in component name: ${name}`);
    }

    return componentIndex;
  }
}
