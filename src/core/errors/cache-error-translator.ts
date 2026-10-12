// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './solo-errors.js';
import {type SoloError} from './solo-error.js';
import {CacheImageTemplateUnknownError} from '../../integration/cache/errors/cache-image-template-unknown-error.js';
import {CacheImageTemplateUndeclaredError} from '../../integration/cache/errors/cache-image-template-undeclared-error.js';
import {CacheProviderNotConfiguredError} from '../../integration/cache/errors/cache-provider-not-configured-error.js';

export class CacheErrorTranslator {
  /**
   * Attempts to translate a cache integration error into the corresponding SoloError.
   * Returns the translated SoloError, or undefined if the error is not a known cache type.
   */
  public static tryTranslate(error: unknown): SoloError | undefined {
    if (error instanceof CacheImageTemplateUnknownError) {
      return new SoloErrors.validation.cacheImageTemplateUnknown(error.key);
    }
    if (error instanceof CacheImageTemplateUndeclaredError) {
      return new SoloErrors.internal.cacheImageTemplateUndeclared(error.template);
    }
    if (error instanceof CacheProviderNotConfiguredError) {
      return new SoloErrors.system.cacheProviderNotConfigured(error.providerName, error.missing);
    }
    return undefined;
  }
}
