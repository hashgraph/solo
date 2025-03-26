// SPDX-License-Identifier: Apache-2.0

export enum SecretType {
  OPAQUE = 'Opaque',
  DOCKER_CONFIG_JSON = 'kubernetes.io/dockerconfigjson',
  DOCKER_CONFIG = 'kubernetes.io/dockerconfig',
  BASIC_AUTH = 'kubernetes.io/basic-auth',
  SSH_AUTH = 'kubernetes.io/ssh-auth',
  TLS = 'kubernetes.io/tls',
  BOOTSTRAP = 'bootstrap.kubernetes.io/token',
}
