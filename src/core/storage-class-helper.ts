// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {StorageClassNotFoundSoloError} from './errors/classes/validation/storage-class-not-found-solo-error.js';
import * as constants from './constants.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type K8} from '../integration/kube/k8.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type StorageClass} from '../integration/kube/resources/storage-class/storage-class.js';
import {PathEx} from '../business/utils/path-ex.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {patchInject} from './dependency-injection/container-helper.js';

@injectable()
export class StorageClassHelper {
  public constructor(
    @inject(InjectTokens.K8Factory) private readonly k8Factory: K8Factory,
    @inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger,
  ) {
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  /**
   * Resolves the StorageClass name to use for PersistentVolumeClaims.
   *
   * Always returns a concrete class name, and never changes the cluster's default StorageClass.
   * When userSuppliedClass is non-empty it is validated against the cluster and returned.
   * When empty, the cluster is inspected in order:
   * 1. Cluster default StorageClass (annotated with is-default-class=true).
   * 2. A StorageClass backed by LOCAL_PATH_PROVISIONER (common on Kind clusters).
   * 3. Install LOCAL_PATH_PROVISIONER from the bundled manifest, without marking it as the
   *    cluster default, then return LOCAL_PATH_STORAGE_CLASS.
   */
  public async resolveStorageClass(context: string, userSuppliedClass: string): Promise<string> {
    const k8: K8 = this.k8Factory.getK8(context);
    const storageClasses: StorageClass[] = await k8.storageClasses().list();

    // Record what was on offer, so a later "why did it pick that one" is answerable from the log alone.
    this.logger.info(
      `StorageClasses available in context ${context}: ${
        storageClasses.length > 0
          ? storageClasses
              .map((storageClass: StorageClass): string => StorageClassHelper.describeStorageClass(storageClass))
              .join('; ')
          : '<none>'
      }`,
    );

    if (userSuppliedClass) {
      const validated: string = this.validateUserClass(storageClasses, userSuppliedClass);
      const matched: StorageClass | undefined = storageClasses.find(
        (storageClass: StorageClass): boolean => storageClass.name === validated,
      );
      this.logger.info(`Using user-supplied StorageClass: ${StorageClassHelper.describeStorageClass(matched)}`);
      return validated;
    }

    const defaultClass: StorageClass | undefined = storageClasses.find(
      (storageClass: StorageClass): boolean => storageClass.isDefault,
    );
    if (defaultClass) {
      this.logger.info(`Using default StorageClass: ${StorageClassHelper.describeStorageClass(defaultClass)}`);
      return defaultClass.name;
    }

    const localPathClass: StorageClass | undefined = storageClasses.find(
      (storageClass: StorageClass): boolean => storageClass.provisioner === constants.LOCAL_PATH_PROVISIONER,
    );
    if (localPathClass) {
      this.logger.info(
        `Using existing ${constants.LOCAL_PATH_PROVISIONER} StorageClass: ${StorageClassHelper.describeStorageClass(localPathClass)}`,
      );
      return localPathClass.name;
    }

    return this.installLocalPath(k8);
  }

  /**
   * Everything about a StorageClass that shapes whether, where and how a volume gets provisioned. With
   * `WaitForFirstConsumer` a stalled provisioner surfaces as pods that never get scheduled, and an `allowedTopologies`
   * restriction that does not overlap with where a pod may run has the same effect — neither is obvious after the
   * fact without these values.
   */
  private static describeStorageClass(storageClass: StorageClass): string {
    const details: string[] = [
      `provisioner: ${storageClass.provisioner || '<unknown>'}`,
      `volumeBindingMode: ${storageClass.volumeBindingMode ?? '<unset>'}`,
      `reclaimPolicy: ${storageClass.reclaimPolicy ?? '<unset>'}`,
      `isDefault: ${storageClass.isDefault}`,
    ];

    if (storageClass.allowVolumeExpansion !== undefined) {
      details.push(`allowVolumeExpansion: ${storageClass.allowVolumeExpansion}`);
    }
    if (storageClass.allowedTopologyKeys?.length > 0) {
      details.push(`allowedTopologyKeys: ${storageClass.allowedTopologyKeys.join(',')}`);
    }
    if (storageClass.mountOptions?.length > 0) {
      details.push(`mountOptions: ${storageClass.mountOptions.join(',')}`);
    }
    if (storageClass.parameterKeys?.length > 0) {
      details.push(`parameterKeys: {${storageClass.parameterKeys.join(', ')}}`);
    }

    return `${storageClass.name} [${details.join(', ')}]`;
  }

  private validateUserClass(storageClasses: StorageClass[], userSuppliedClass: string): string {
    if (!storageClasses.some((storageClass: StorageClass): boolean => storageClass.name === userSuppliedClass)) {
      const available: string = storageClasses
        .map((storageClass: StorageClass): string => storageClass.name)
        .join(', ');
      throw new StorageClassNotFoundSoloError(userSuppliedClass, available);
    }
    return userSuppliedClass;
  }

  private async installLocalPath(k8: K8): Promise<string> {
    const manifestPath: string = PathEx.joinWithRealPath(constants.RESOURCES_DIR, 'local-path-provisioner.yaml');
    this.logger.showUser(
      `No default StorageClass found in cluster — installing ${constants.LOCAL_PATH_PROVISIONER}-provisioner ` +
        '(not set as cluster default). Use --pvc-storage-class to specify an existing StorageClass.',
    );
    await k8.manifests().applyManifest(manifestPath, {ignoreExisting: true});
    return constants.LOCAL_PATH_STORAGE_CLASS;
  }
}
