// SPDX-License-Identifier: Apache-2.0

import {type ContainerStatus} from '../../../resources/pod/container-status.js';
import {type V1ContainerStatus} from '@kubernetes/client-node';

export class K8ClientContainerStatus implements ContainerStatus {
  public constructor(
    public readonly name: string,
    public readonly ready?: boolean,
    public readonly restartCount?: number,
    public readonly waitingReason?: string,
    public readonly waitingMessage?: string,
    public readonly terminatedReason?: string,
    public readonly terminatedExitCode?: number,
  ) {}

  public static from(v1Status: V1ContainerStatus): K8ClientContainerStatus {
    return new K8ClientContainerStatus(
      v1Status.name ?? '<unknown>',
      v1Status.ready,
      v1Status.restartCount,
      v1Status.state?.waiting?.reason,
      v1Status.state?.waiting?.message,
      v1Status.state?.terminated?.reason,
      v1Status.state?.terminated?.exitCode,
    );
  }
}
