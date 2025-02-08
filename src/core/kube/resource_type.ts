/**
 * SPDX-License-Identifier: Apache-2.0
 */
export enum ResourceType {
  NAMESPACE = 'Namespace',
  CONFIG_MAP = 'ConfigMap',
  SECRET = 'Secret',
  SERVICE = 'Service',
  DEPLOYMENT = 'Deployment',
  STATEFUL_SET = 'StatefulSet',
  POD = 'Pod',
  JOB = 'Job',
  CRON_JOB = 'CronJob',
  INGRESS = 'Ingress',
  INGRESS_CLASS = 'IngressClass',
  NETWORK_POLICY = 'NetworkPolicy',
  ROLE = 'Role',
  ROLE_BINDING = 'RoleBinding',
  SERVICE_ACCOUNT = 'ServiceAccount',
  PERSISTENT_VOLUME = 'PersistentVolume',
  PERSISTENT_VOLUME_CLAIM = 'PersistentVolumeClaim',
  STORAGE_CLASS = 'StorageClass',
  CLUSTER_ROLE = 'ClusterRole',
  CLUSTER_ROLE_BINDING = 'ClusterRoleBinding',
  CLUSTER = 'Cluster',
  CONTAINER = 'Container',
}
