// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {KindProviderResolver} from '../../../../src/integration/container-engine/kind-provider-resolver.js';
import {SubprocessEnvironment} from '../../../../src/core/subprocess-environment.js';

describe('KindProviderResolver', (): void => {
  let previousKindProvider: string | undefined;

  beforeEach((): void => {
    previousKindProvider = process.env.KIND_EXPERIMENTAL_PROVIDER;
  });

  afterEach((): void => {
    SubprocessEnvironment.resetForTesting();
    if (previousKindProvider === undefined) {
      delete process.env.KIND_EXPERIMENTAL_PROVIDER;
    } else {
      process.env.KIND_EXPERIMENTAL_PROVIDER = previousKindProvider;
    }
  });

  it('returns undefined when neither session state nor the environment set a provider', (): void => {
    delete process.env.KIND_EXPERIMENTAL_PROVIDER;

    expect(KindProviderResolver.current()).to.equal(undefined);
  });

  it('falls back to a user-provided KIND_EXPERIMENTAL_PROVIDER environment variable', (): void => {
    process.env.KIND_EXPERIMENTAL_PROVIDER = 'podman';

    expect(KindProviderResolver.current()).to.equal('podman');
  });

  it('prefers the session value over the environment variable', (): void => {
    process.env.KIND_EXPERIMENTAL_PROVIDER = 'docker';
    SubprocessEnvironment.setSessionVariable('KIND_EXPERIMENTAL_PROVIDER', 'podman');

    expect(KindProviderResolver.current()).to.equal('podman');
  });
});
