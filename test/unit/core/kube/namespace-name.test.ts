// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {NamespaceName} from '../../../../src/integration/kube/resources/namespace/namespace-name.js';

import {NamespaceNameInvalidError} from '../../../../src/integration/kube/errors/namespace-name-invalid-error.js';

describe('Namespace Name', () => {
  it('should throw an error if namespace is not valid', () => {
    const namespaceName = 'node=/invalid/path';

    expect(() => NamespaceName.of(namespaceName)).to.throw(
      NamespaceNameInvalidError,
      NamespaceNameInvalidError.NAMESPACE_NAME_INVALID(namespaceName),
    );
  });

  it('should match a NamespaceName', () => {
    const namespaceName = 'valid-namespace';
    const namespace = NamespaceName.of(namespaceName);
    const namespaces = [namespace];

    expect(namespaces.some(ns => ns.equals(NamespaceName.of(namespaceName)))).to.be.true;
  });

  it('should not match a NamespaceName', () => {
    const namespaceName = 'valid-namespace';
    const namespace = NamespaceName.of(namespaceName);
    const namespaces = [namespace];

    expect(namespaces.some(ns => ns.equals(NamespaceName.of('invalid-namespace')))).to.be.false;
  });
});
