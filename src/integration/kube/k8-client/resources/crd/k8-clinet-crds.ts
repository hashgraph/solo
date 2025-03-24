// SPDX-License-Identifier: Apache-2.0

import {SoloLogger} from '../../../../../core/logging.js';
import {type ApiextensionsV1Api} from '@kubernetes/client-node';
import {container} from 'tsyringe-neo';
import {type Crds} from '../../../resources/crd/crds.js';

export class K8ClientCRDs implements Crds {
  private readonly logger: SoloLogger;

  constructor(private readonly networkingApi: ApiextensionsV1Api) {
    this.logger = container.resolve(SoloLogger);
  }

  async ifExists(crdName: string): Promise<boolean> {
    try {
      const response = await this.networkingApi.readCustomResourceDefinition(crdName);
      this.logger.debug(`CRD ${crdName} exists, response:`, response);
      return true;
    } catch (err) {
      if (err.response && err.response.statusCode === 404) {
        this.logger.error(`CRD ${crdName} does not exist.`);
        return false;
      } else {
        this.logger.error('Error checking CRD:', err);
        throw err; // Re-throw unexpected errors
      }
    }
  }
}
