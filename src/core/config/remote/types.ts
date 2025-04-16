// SPDX-License-Identifier: Apache-2.0

export type EmailAddress = `${string}@${string}.${string}`;
export type Version = string;
/// TODO - see if we can use NamespaceName and use some annotations and overrides to covert to strings
export type NamespaceNameAsString = string;
export type DeploymentName = string;
export type Context = string;
export type ComponentId = number;

export type ClusterReference = string;
export type ClusterReferences = Record<ClusterReference, Context>;
