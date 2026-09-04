// SPDX-License-Identifier: Apache-2.0

import {ClusterAddFailedError} from './classes/deployment/cluster-add-failed-error.js';
import {ClusterReferenceAlreadyExistsError} from './classes/deployment/cluster-reference-already-exists-error.js';
import {ClusterReferenceNotFoundError} from './classes/deployment/cluster-reference-not-found-error.js';
import {ClusterReferenceResolutionFailedError} from './classes/deployment/cluster-reference-resolution-failed-error.js';
import {ContextNotFoundForClusterError} from './classes/deployment/context-not-found-for-cluster-error.js';
import {DeploymentDeleteFailedError} from './classes/deployment/deployment-delete-failed-error.js';
import {DeploymentHasRemoteResourcesError} from './classes/deployment/deployment-has-remote-resources-error.js';
import {DeploymentImportFailedSoloError} from './classes/deployment/deployment-import-failed-solo-error.js';
import {DeploymentListFailedError} from './classes/deployment/deployment-list-failed-error.js';
import {DeploymentListPortsFailedError} from './classes/deployment/deployment-list-ports-failed-error.js';
import {DeploymentNotFoundError} from './classes/deployment/deployment-not-found-error.js';
import {NamespaceNotSetError} from './classes/deployment/namespace-not-set-error.js';
import {NoClustersForDeploymentError} from './classes/deployment/no-clusters-for-deployment-error.js';
import {NoDeploymentsFoundError} from './classes/deployment/no-deployments-found-error.js';
import {DataValidationError} from './classes/internal/data-validation-error.js';
import {IllegalArgumentError} from './classes/validation/illegal-argument-error.js';
import {MissingArgumentError} from './classes/validation/missing-argument-error.js';
import {ConsensusNodeCountRequiredError} from './classes/validation/consensus-node-count-required-error.js';
import {InvalidOutputFormatError} from './classes/validation/invalid-output-format-error.js';
import {InvalidPortNumberError} from './classes/validation/invalid-port-number-error.js';
import {ClusterConnectionFailedError} from './classes/system/cluster-connection-failed-error.js';
import {ClusterUnreachableError} from './classes/system/cluster-unreachable-error.js';
import {KindClusterStoppedError} from './classes/system/kind-cluster-stopped-error.js';
import {ContainerEngineNotRunningError} from './classes/system/container-engine-not-running-error.js';
import {GitHubApiHttpResponseError} from './classes/system/github-api-http-response-error.js';
import {GitHubApiRequestFailedError} from './classes/system/github-api-request-failed-error.js';
import {GitHubApiResponseMissingTagNameError} from './classes/system/github-api-response-missing-tag-name-error.js';
import {GitHubApiResponseParseFailedError} from './classes/system/github-api-response-parse-failed-error.js';
import {PortForwardRefreshFailedError} from './classes/system/port-forward-refresh-failed-error.js';
import {PortForwardStopFailedError} from './classes/system/port-forward-stop-failed-error.js';
import {PortForwardStatusFailedError} from './classes/system/port-forward-status-failed-error.js';
import {ResourceNotFoundError} from './classes/system/resource-not-found-error.js';
import {IncompleteLocalConfigError} from './classes/config/incomplete-local-config-error.js';
import {LocalConfigNotFoundSoloError} from './classes/config/local-config-not-found-solo-error.js';
import {ReadRemoteConfigBeforeLoadError} from './classes/internal/read-remote-config-before-load-error.js';
import {RefreshLocalConfigSourceError} from './classes/config/refresh-local-config-source-error.js';
import {RemoteConfigDataInvalidSoloError} from './classes/config/remote-config-data-invalid-solo-error.js';
import {MigrateLegacyLocalConfigError} from './classes/config/migrate-legacy-local-config-error.js';
import {RemoteConfigsMismatchSoloError} from './classes/config/remote-configs-mismatch-solo-error.js';
import {RemoteConfigMissingOnKindClusterError} from './classes/config/remote-config-missing-on-kind-cluster-error.js';
import {WriteLocalConfigFileError} from './classes/config/write-local-config-file-error.js';
import {WriteRemoteConfigBeforeLoadError} from './classes/internal/write-remote-config-before-load-error.js';
import {BlockNodeAddExternalFailedSoloError} from './classes/component/block-node-add-external-failed-solo-error.js';
import {BlockNodeConfigFailedSoloError} from './classes/component/block-node-config-failed-solo-error.js';
import {BlockNodeDeleteExternalFailedSoloError} from './classes/component/block-node-delete-external-failed-solo-error.js';
import {BlockNodeDeployFailedSoloError} from './classes/component/block-node-deploy-failed-solo-error.js';
import {BlockNodeDestroyFailedSoloError} from './classes/component/block-node-destroy-failed-solo-error.js';
import {BlockNodeJfrCollectionFailedSoloError} from './classes/component/block-node-jfr-collection-failed-solo-error.js';
import {BlockNodeHealthCheckFailedSoloError} from './classes/component/block-node-health-check-failed-solo-error.js';
import {BlockNodeUpgradeFailedSoloError} from './classes/component/block-node-upgrade-failed-solo-error.js';
import {ChartInstallFailedSoloError} from './classes/component/chart-install-failed-solo-error.js';
import {NetworkDestroyFailedSoloError} from './classes/component/network-destroy-failed-solo-error.js';
import {NodeBuildCopyFailedSoloError} from './classes/component/node-build-copy-failed-solo-error.js';
import {NodeBuildUploadFailedSoloError} from './classes/component/node-build-upload-failed-solo-error.js';
import {NodeDebugArchiveFailedSoloError} from './classes/component/node-debug-archive-failed-solo-error.js';
import {NodeJfrExecutionFailedSoloError} from './classes/component/node-jfr-execution-failed-solo-error.js';
import {NodeJfrPidNotFoundSoloError} from './classes/component/node-jfr-pid-not-found-solo-error.js';
import {NodeNotReadySoloError} from './classes/component/node-not-ready-solo-error.js';
import {NodeTransactionFailedSoloError} from './classes/component/node-transaction-failed-solo-error.js';
import {NodeStakeTransactionErrorSoloError} from './classes/component/node-stake-transaction-error-solo-error.js';
import {NodePrepareUpgradeTransactionErrorSoloError} from './classes/component/node-prepare-upgrade-transaction-error-solo-error.js';
import {NodeFreezeUpgradeTransactionErrorSoloError} from './classes/component/node-freeze-upgrade-transaction-error-solo-error.js';
import {NodeFreezeTransactionErrorSoloError} from './classes/component/node-freeze-transaction-error-solo-error.js';
import {NodeUpdateTransactionErrorSoloError} from './classes/component/node-update-transaction-error-solo-error.js';
import {NodeDeleteTransactionErrorSoloError} from './classes/component/node-delete-transaction-error-solo-error.js';
import {NodeCreateTransactionErrorSoloError} from './classes/component/node-create-transaction-error-solo-error.js';
import {AccountBalanceQueryFailedSoloError} from './classes/component/account-balance-query-failed-solo-error.js';
import {ConfigFileNotFoundSoloError} from './classes/validation/config-file-not-found-solo-error.js';
import {GrpcEndpointsRequiredSoloError} from './classes/validation/grpc-endpoints-required-solo-error.js';
import {InputDirectoryNotSpecifiedSoloError} from './classes/validation/input-directory-not-specified-solo-error.js';
import {LocalBuildMissingSubdirectoriesSoloError} from './classes/validation/local-build-missing-subdirectories-solo-error.js';
import {LocalBuildNoJarFilesSoloError} from './classes/validation/local-build-no-jar-files-solo-error.js';
import {LocalBuildPathNotFoundSoloError} from './classes/validation/local-build-path-not-found-solo-error.js';
import {NodeJarFilesNotInContainerSoloError} from './classes/validation/node-jar-files-not-in-container-solo-error.js';
import {NodeVersionMismatchSoloError} from './classes/validation/node-version-mismatch-solo-error.js';
import {NonInteractivePromptSoloError} from './classes/validation/non-interactive-prompt-solo-error.js';
import {OutputDirectoryNotSpecifiedSoloError} from './classes/validation/output-directory-not-specified-solo-error.js';
import {PvcFlagNotEnabledSoloError} from './classes/validation/pvc-flag-not-enabled-solo-error.js';
import {UpgradeVersionNotFoundSoloError} from './classes/validation/upgrade-version-not-found-solo-error.js';
import {WrapsKeyPathNotFoundSoloError} from './classes/validation/wraps-key-path-not-found-solo-error.js';
import {WrapsVersionConstraintSoloError} from './classes/validation/wraps-version-constraint-solo-error.js';
import {ClusterReferenceUndeterminedSoloError} from './classes/system/cluster-reference-undetermined-solo-error.js';
import {ConsensusNodeNotInConfigSoloError} from './classes/system/consensus-node-not-in-config-solo-error.js';
import {GrpcProxyEndpointFailedSoloError} from './classes/system/grpc-proxy-endpoint-failed-solo-error.js';
import {HaproxyPodsNotFoundSoloError} from './classes/system/haproxy-pods-not-found-solo-error.js';
import {K8sSecretCreateFailedSoloError} from './classes/system/k8s-secret-create-failed-solo-error.js';
import {KubeContextNotFoundSoloError} from './classes/system/kube-context-not-found-solo-error.js';
import {LoadBalancerNotFoundSoloError} from './classes/system/load-balancer-not-found-solo-error.js';
import {MultipleDeploymentsFoundSoloError} from './classes/system/multiple-deployments-found-solo-error.js';
import {NamespaceNotFoundSoloError} from './classes/system/namespace-not-found-solo-error.js';
import {NoPvcFoundSoloError} from './classes/system/no-pvc-found-solo-error.js';
import {PodNotFoundSoloError} from './classes/system/pod-not-found-solo-error.js';
import {PortForwardMissingSoloError} from './classes/system/port-forward-missing-solo-error.js';
import {StatesDirectoryNotFoundSoloError} from './classes/system/states-directory-not-found-solo-error.js';
import {UpgradeVersionFetchFailedSoloError} from './classes/system/upgrade-version-fetch-failed-solo-error.js';
import {UnsupportedOperationError} from './classes/internal/unsupported-operation-error.js';
import {CreateDeploymentSoloError} from './classes/deployment/create-deployment-solo-error.js';
import {DeploymentAlreadyExistsSoloError} from './classes/deployment/deployment-already-exists-solo-error.js';
import {RapidFireExecutionSoloError} from './classes/component/rapid-fire-execution-solo-error.js';
import {RapidFireKillFailedSoloError} from './classes/component/rapid-fire-kill-failed-solo-error.js';
import {RapidFireLoadStartFailedSoloError} from './classes/component/rapid-fire-load-start-failed-solo-error.js';
import {RapidFireLoadStopFailedSoloError} from './classes/component/rapid-fire-load-stop-failed-solo-error.js';
import {StateFilePathNotFoundSoloError} from './classes/validation/state-file-path-not-found-solo-error.js';
import {StateFileNotFoundSoloError} from './classes/validation/state-file-not-found-solo-error.js';
import {InvalidStateFileFormatSoloError} from './classes/validation/invalid-state-file-format-solo-error.js';
import {InvalidStateZipFileNameSoloError} from './classes/validation/invalid-state-zip-file-name-solo-error.js';
import {ExplorerDeployFailedSoloError} from './classes/component/explorer-deploy-failed-solo-error.js';
import {ExplorerUpgradeFailedSoloError} from './classes/component/explorer-upgrade-failed-solo-error.js';
import {ExplorerDestroyFailedSoloError} from './classes/component/explorer-destroy-failed-solo-error.js';
import {RelayDeployFailedSoloError} from './classes/component/relay-deploy-failed-solo-error.js';
import {RelayUpgradeFailedSoloError} from './classes/component/relay-upgrade-failed-solo-error.js';
import {RelayDestroyFailedSoloError} from './classes/component/relay-destroy-failed-solo-error.js';
import {RelayNotRunningSoloError} from './classes/component/relay-not-running-solo-error.js';
import {RelayNotReadySoloError} from './classes/component/relay-not-ready-solo-error.js';
import {RelayOperatorKeyRetrievalFailedSoloError} from './classes/component/relay-operator-key-retrieval-failed-solo-error.js';
import {MirrorNodeDeployFailedSoloError} from './classes/component/mirror-node-deploy-failed-solo-error.js';
import {MirrorNodeUpgradeFailedSoloError} from './classes/component/mirror-node-upgrade-failed-solo-error.js';
import {MirrorNodeDestroyFailedSoloError} from './classes/component/mirror-node-destroy-failed-solo-error.js';
import {MirrorNodeOperatorKeyRetrievalFailedSoloError} from './classes/component/mirror-node-operator-key-retrieval-failed-solo-error.js';
import {OneShotDeployFailedSoloError} from './classes/component/one-shot-deploy-failed-solo-error.js';
import {OneShotDestroyFailedSoloError} from './classes/component/one-shot-destroy-failed-solo-error.js';
import {OneShotDeploymentInfoRetrievalFailedSoloError} from './classes/component/one-shot-deployment-info-retrieval-failed-solo-error.js';
import {FalconValuesPreparationFailedSoloError} from './classes/component/falcon-values-preparation-failed-solo-error.js';
import {BlockNodeNotInRemoteConfigSoloError} from './classes/system/block-node-not-in-remote-config-solo-error.js';
import {BlockNodeNotReadySoloError} from './classes/system/block-node-not-ready-solo-error.js';
import {BlockNodePodNotFoundSoloError} from './classes/system/block-node-pod-not-found-solo-error.js';
import {BlockNodesJsonEmptySoloError} from './classes/system/block-nodes-json-empty-solo-error.js';
import {ExternalBlockNodeNotInRemoteConfigSoloError} from './classes/system/external-block-node-not-in-remote-config-solo-error.js';
import {ExplorerPodNotFoundSoloError} from './classes/system/explorer-pod-not-found-solo-error.js';
import {ExplorerNotInRemoteConfigSoloError} from './classes/system/explorer-not-in-remote-config-solo-error.js';
import {RelayPodNotFoundSoloError} from './classes/system/relay-pod-not-found-solo-error.js';
import {RelayNotInRemoteConfigSoloError} from './classes/system/relay-not-in-remote-config-solo-error.js';
import {MirrorNodePodsNotFoundSoloError} from './classes/system/mirror-node-pods-not-found-solo-error.js';
import {MirrorIngressControllerPodNotFoundSoloError} from './classes/system/mirror-ingress-controller-pod-not-found-solo-error.js';
import {MirrorNodeNotInRemoteConfigSoloError} from './classes/system/mirror-node-not-in-remote-config-solo-error.js';
import {ClusterNotFoundInRemoteConfigSoloError} from './classes/system/cluster-not-found-in-remote-config-solo-error.js';
import {BlockNodeInvalidComponentIdSoloError} from './classes/validation/block-node-invalid-component-id-solo-error.js';
import {BlockNodeLocalImageNotFoundSoloError} from './classes/validation/block-node-local-image-not-found-solo-error.js';
import {ExplorerInvalidComponentIdSoloError} from './classes/validation/explorer-invalid-component-id-solo-error.js';
import {RelayInvalidComponentIdSoloError} from './classes/validation/relay-invalid-component-id-solo-error.js';
import {MirrorNodeInvalidComponentIdSoloError} from './classes/validation/mirror-node-invalid-component-id-solo-error.js';
import {ClusterSetupFailedSoloError} from './classes/deployment/cluster-setup-failed-solo-error.js';
import {ClusterResetFailedSoloError} from './classes/deployment/cluster-reset-failed-solo-error.js';
import {MinioInstallFailedSoloError} from './classes/deployment/minio-install-failed-solo-error.js';
import {MinioOperatorCrdsOrphanedSoloError} from './classes/system/minio-operator-crds-orphaned-solo-error.js';
import {PrometheusInstallFailedSoloError} from './classes/deployment/prometheus-install-failed-solo-error.js';
import {MetricsServerInstallFailedSoloError} from './classes/deployment/metrics-server-install-failed-solo-error.js';
import {ClusterRoleInstallFailedSoloError} from './classes/deployment/cluster-role-install-failed-solo-error.js';
import {ClusterApiServerTimeoutSoloError} from './classes/deployment/cluster-api-server-timeout-solo-error.js';
import {KindClusterNetworkSetupFailedSoloError} from './classes/deployment/kind-cluster-network-setup-failed-solo-error.js';
import {BackupExportFailedSoloError} from './classes/deployment/backup-export-failed-solo-error.js';
import {BackupImportFailedSoloError} from './classes/deployment/backup-import-failed-solo-error.js';
import {BackupRestoreClustersFailedSoloError} from './classes/deployment/backup-restore-clusters-failed-solo-error.js';
import {DeployNetworkFailedSoloError} from './classes/deployment/deploy-network-failed-solo-error.js';
import {BlockNodeClusterContextNotFoundSoloError} from './classes/deployment/block-node-cluster-context-not-found-solo-error.js';
import {MirrorNodeClusterContextNotFoundSoloError} from './classes/deployment/mirror-node-cluster-context-not-found-solo-error.js';
import {AccountCreationFailedSoloError} from './classes/component/account-creation-failed-solo-error.js';
import {AccountKeyUpdateFailedSoloError} from './classes/component/account-key-update-failed-solo-error.js';
import {AccountKeysBatchUpdateFailedSoloError} from './classes/component/account-keys-batch-update-failed-solo-error.js';
import {AccountTransferFailedSoloError} from './classes/component/account-transfer-failed-solo-error.js';
import {AccountInfoFailedSoloError} from './classes/component/account-info-failed-solo-error.js';
import {AccountUpdateFailedSoloError} from './classes/component/account-update-failed-solo-error.js';
import {AccountSecretCreationFailedSoloError} from './classes/component/account-secret-creation-failed-solo-error.js';
import {EvmAddressRetrievalFailedSoloError} from './classes/component/evm-address-retrieval-failed-solo-error.js';
import {NodeAccessConfigFailedSoloError} from './classes/component/node-access-config-failed-solo-error.js';
import {NodeClientLoadFailedSoloError} from './classes/component/node-client-load-failed-solo-error.js';
import {NodeClientRefreshFailedSoloError} from './classes/component/node-client-refresh-failed-solo-error.js';
import {NodeClientSetupFailedSoloError} from './classes/component/node-client-setup-failed-solo-error.js';
import {SdkPingFailedSoloError} from './classes/component/sdk-ping-failed-solo-error.js';
import {SdkClientNoHealthyNodesSoloError} from './classes/component/sdk-client-no-healthy-nodes-solo-error.js';
import {NodeServicesRetrievalFailedSoloError} from './classes/component/node-services-retrieval-failed-solo-error.js';
import {NodeServiceNotFoundSoloError} from './classes/component/node-service-not-found-solo-error.js';
import {GossipKeySecretCreationFailedSoloError} from './classes/component/gossip-key-secret-creation-failed-solo-error.js';
import {GossipKeySecretRestoreFailedSoloError} from './classes/component/gossip-key-secret-restore-failed-solo-error.js';
import {TlsKeySecretCreationFailedSoloError} from './classes/component/tls-key-secret-creation-failed-solo-error.js';
import {TlsKeyGenerationFailedSoloError} from './classes/component/tls-key-generation-failed-solo-error.js';
import {SigningKeyGenerationFailedSoloError} from './classes/component/signing-key-generation-failed-solo-error.js';
import {NodeKeyLoadFailedSoloError} from './classes/component/node-key-load-failed-solo-error.js';
import {GrpcTlsKeyGenerationFailedSoloError} from './classes/component/grpc-tls-key-generation-failed-solo-error.js';
import {GrpcTlsCertMismatchSoloError} from './classes/component/grpc-tls-cert-mismatch-solo-error.js';
import {GrpcWebTlsCertMismatchSoloError} from './classes/component/grpc-web-tls-cert-mismatch-solo-error.js';
import {CertificateSecretCreationFailedSoloError} from './classes/component/certificate-secret-creation-failed-solo-error.js';
import {CertificateParsingFailedSoloError} from './classes/component/certificate-parsing-failed-solo-error.js';
import {CertificateFileNotFoundSoloError} from './classes/component/certificate-file-not-found-solo-error.js';
import {ExplorerTlsSecretCreationFailedSoloError} from './classes/component/explorer-tls-secret-creation-failed-solo-error.js';
import {PlatformFileNotFoundSoloError} from './classes/component/platform-file-not-found-solo-error.js';
import {PlatformFileCopyFailedSoloError} from './classes/component/platform-file-copy-failed-solo-error.js';
import {PlatformKeyFileMissingSoloError} from './classes/component/platform-key-file-missing-solo-error.js';
import {GenesisAdminKeySecretFailedSoloError} from './classes/component/genesis-admin-key-secret-failed-solo-error.js';
import {GenesisDataGenerationFailedSoloError} from './classes/component/genesis-data-generation-failed-solo-error.js';
import {PostgresInitScriptCopyFailedSoloError} from './classes/component/postgres-init-script-copy-failed-solo-error.js';
import {PostgresInitScriptFailedSoloError} from './classes/component/postgres-init-script-failed-solo-error.js';
import {MirrorPasswordSecretMissingSoloError} from './classes/component/mirror-password-secret-missing-solo-error.js';
import {FileContentVerificationFailedSoloError} from './classes/component/file-content-verification-failed-solo-error.js';
import {FileContentMismatchSoloError} from './classes/component/file-content-mismatch-solo-error.js';
import {HederaFileCreationFailedSoloError} from './classes/component/hedera-file-creation-failed-solo-error.js';
import {HederaFileUpdateFailedSoloError} from './classes/component/hedera-file-update-failed-solo-error.js';
import {HederaFileAppendFailedSoloError} from './classes/component/hedera-file-append-failed-solo-error.js';
import {NodeStatusEmptyResponseSoloError} from './classes/component/node-status-empty-response-solo-error.js';
import {NodeStatusMissingLineSoloError} from './classes/component/node-status-missing-line-solo-error.js';
import {PredefinedAccountsCreationFailedSoloError} from './classes/component/predefined-accounts-creation-failed-solo-error.js';
import {NodeContainerCrashedSoloError} from './classes/component/node-container-crashed-solo-error.js';
import {InvalidHbarAmountSoloError} from './classes/validation/invalid-hbar-amount-solo-error.js';
import {InvalidFileIdFormatSoloError} from './classes/validation/invalid-file-id-format-solo-error.js';
import {InvalidEndpointFormatSoloError} from './classes/validation/invalid-endpoint-format-solo-error.js';
import {InvalidCommaSeparatedStringSoloError} from './classes/validation/invalid-comma-separated-string-solo-error.js';
import {InvalidConfigNumberValueSoloError} from './classes/validation/invalid-config-number-value-solo-error.js';
import {InvalidStorageTypeSoloError} from './classes/validation/invalid-storage-type-solo-error.js';
import {UnsupportedFlagFieldTypeSoloError} from './classes/validation/unsupported-flag-field-type-solo-error.js';
import {VersionDowngradeBlockedSoloError} from './classes/validation/version-downgrade-blocked-solo-error.js';
import {AdminKeysCountMismatchSoloError} from './classes/validation/admin-keys-count-mismatch-solo-error.js';
import {ComponentAlreadyExistsSoloError} from './classes/validation/component-already-exists-solo-error.js';
import {ComponentIdRequiredSoloError} from './classes/validation/component-id-required-solo-error.js';
import {ComponentNotFoundSoloError} from './classes/validation/component-not-found-solo-error.js';
import {ComponentNotInRemoteConfigSoloError} from './classes/validation/component-not-in-remote-config-solo-error.js';
import {UnknownComponentTypeSoloError} from './classes/validation/unknown-component-type-solo-error.js';
import {ConfigFileInvalidSoloError} from './classes/validation/config-file-invalid-solo-error.js';
import {MultipleClustersFoundSoloError} from './classes/validation/multiple-clusters-found-solo-error.js';
import {CacheNotMaterializedSoloError} from './classes/validation/cache-not-materialized-solo-error.js';
import {CacheImageTemplateUnknownSoloError} from './classes/validation/cache-image-template-unknown-solo-error.js';
import {InvalidKindNodeImageSoloError} from './classes/validation/invalid-kind-node-image-solo-error.js';
import {PathTraversalDetectedSoloError} from './classes/validation/path-traversal-detected-solo-error.js';
import {NodeAliasesMustBeArraySoloError} from './classes/validation/node-aliases-must-be-array-solo-error.js';
import {UnknownNodeAliasSoloError} from './classes/validation/unknown-node-alias-solo-error.js';
import {NodeAliasInferenceFailedSoloError} from './classes/validation/node-alias-inference-failed-solo-error.js';
import {NodeAliasParseFailedSoloError} from './classes/validation/node-alias-parse-failed-solo-error.js';
import {DomainNameParseFailedSoloError} from './classes/validation/domain-name-parse-failed-solo-error.js';
import {UnknownTemplateDependencySoloError} from './classes/validation/unknown-template-dependency-solo-error.js';
import {NoConsensusNodesFoundSoloError} from './classes/validation/no-consensus-nodes-found-solo-error.js';
import {ServiceTypeMismatchSoloError} from './classes/validation/service-type-mismatch-solo-error.js';
import {BackupConfigNotFoundSoloError} from './classes/validation/backup-config-not-found-solo-error.js';
import {BackupConfigInvalidSoloError} from './classes/validation/backup-config-invalid-solo-error.js';
import {BackupConfigReadFailedSoloError} from './classes/validation/backup-config-read-failed-solo-error.js';
import {BackupConfigMapKeyMissingSoloError} from './classes/validation/backup-config-map-key-missing-solo-error.js';
import {BackupConfigParseFailedSoloError} from './classes/validation/backup-config-parse-failed-solo-error.js';
import {BackupInputDirectoryNotFoundSoloError} from './classes/validation/backup-input-directory-not-found-solo-error.js';
import {BackupNoClusterDirectoriesSoloError} from './classes/validation/backup-no-cluster-directories-solo-error.js';
import {BackupClusterValidationFailedSoloError} from './classes/validation/backup-cluster-validation-failed-solo-error.js';
import {BackupNoClusterInfoSoloError} from './classes/validation/backup-no-cluster-info-solo-error.js';
import {BackupNoComponentsSoloError} from './classes/validation/backup-no-components-solo-error.js';
import {BackupOptionsFileNotFoundSoloError} from './classes/validation/backup-options-file-not-found-solo-error.js';
import {BackupZipFileRequiredSoloError} from './classes/validation/backup-zip-file-required-solo-error.js';
import {BackupInputPathNotFoundSoloError} from './classes/validation/backup-input-path-not-found-solo-error.js';
import {BackupInputMustBeZipSoloError} from './classes/validation/backup-input-must-be-zip-solo-error.js';
import {BackupNoLogFilesSoloError} from './classes/validation/backup-no-log-files-solo-error.js';
import {BackupDatabaseDumpNotFoundSoloError} from './classes/validation/backup-database-dump-not-found-solo-error.js';
import {FlagInputFailedSoloError} from './classes/validation/flag-input-failed-solo-error.js';
import {ConfirmationRequiredSoloError} from './classes/validation/confirmation-required-solo-error.js';
import {ValuesFileNotFoundSoloError} from './classes/validation/values-file-not-found-solo-error.js';
import {ValuesFileParseFailedSoloError} from './classes/validation/values-file-parse-failed-solo-error.js';
import {InvalidFlagValueSoloError} from './classes/validation/invalid-flag-value-solo-error.js';
import {TransplantRequiresStateFileSoloError} from './classes/validation/transplant-requires-state-file-solo-error.js';
import {HelmRepoSetupFailedSoloError} from './classes/system/helm-repo-setup-failed-solo-error.js';
import {HelmRepoCheckFailedSoloError} from './classes/system/helm-repo-check-failed-solo-error.js';
import {HelmChartListFailedSoloError} from './classes/system/helm-chart-list-failed-solo-error.js';
import {HelmChartGenericInstallFailedSoloError} from './classes/system/helm-chart-generic-install-failed-solo-error.js';
import {HelmChartUninstallFailedSoloError} from './classes/system/helm-chart-uninstall-failed-solo-error.js';
import {HelmChartUpgradeFailedSoloError} from './classes/system/helm-chart-upgrade-failed-solo-error.js';
import {HelmChartPullNoArchiveSoloError} from './classes/system/helm-chart-pull-no-archive-solo-error.js';
import {FileNotFoundSoloError} from './classes/system/file-not-found-solo-error.js';
import {FileCopyFailedSoloError} from './classes/system/file-copy-failed-solo-error.js';
import {FileEmptySoloError} from './classes/system/file-empty-solo-error.js';
import {FileInvalidJsonSoloError} from './classes/system/file-invalid-json-solo-error.js';
import {DirectoryCreationFailedSoloError} from './classes/system/directory-creation-failed-solo-error.js';
import {ArchiveUnzipFailedSoloError} from './classes/system/archive-unzip-failed-solo-error.js';
import {ArchiveTarFailedSoloError} from './classes/system/archive-tar-failed-solo-error.js';
import {ArchiveUntarFailedSoloError} from './classes/system/archive-untar-failed-solo-error.js';
import {DependencyVersionCheckFailedSoloError} from './classes/system/dependency-version-check-failed-solo-error.js';
import {DependencyNotFoundSoloError} from './classes/system/dependency-not-found-solo-error.js';
import {DependencyManagerNotFoundSoloError} from './classes/system/dependency-manager-not-found-solo-error.js';
import {DependencyInstallFailedSoloError} from './classes/system/dependency-install-failed-solo-error.js';
import {DependencyInstallDirectoryConflictSoloError} from './classes/system/dependency-install-directory-conflict-solo-error.js';
import {GitHubReleasesNotFoundSoloError} from './classes/system/github-releases-not-found-solo-error.js';
import {GitHubReleaseTagNotFoundSoloError} from './classes/system/github-release-tag-not-found-solo-error.js';
import {GitHubReleaseAssetNotFoundSoloError} from './classes/system/github-release-asset-not-found-solo-error.js';
import {HomebrewInstallFailedSoloError} from './classes/system/homebrew-install-failed-solo-error.js';
import {UnsupportedLinuxDistributionSoloError} from './classes/system/unsupported-linux-distribution-solo-error.js';
import {PodmanMachineInspectFailedSoloError} from './classes/system/podman-machine-inspect-failed-solo-error.js';
import {PodmanRuntimeConfigurationFailedSoloError} from './classes/system/podman-runtime-configuration-failed-solo-error.js';
import {PodNotReadySoloError} from './classes/system/pod-not-ready-solo-error.js';
import {DockerAuthStaleSoloError} from './classes/system/docker-auth-stale-solo-error.js';
import {PvcCreationFailedSoloError} from './classes/system/pvc-creation-failed-solo-error.js';
import {KubernetesApiInvalidResponseSoloError} from './classes/system/kubernetes-api-invalid-response-solo-error.js';
import {IngressClassListFailedSoloError} from './classes/system/ingress-class-list-failed-solo-error.js';
import {MultipleItemsFoundSoloError} from './classes/system/multiple-items-found-solo-error.js';
import {PodCreationFailedSoloError} from './classes/system/pod-creation-failed-solo-error.js';
import {PackageDownloadFailedSoloError} from './classes/system/package-download-failed-solo-error.js';
import {ChecksumReadFailedSoloError} from './classes/system/checksum-read-failed-solo-error.js';
import {ContainerInvalidPathSoloError} from './classes/system/container-invalid-path-solo-error.js';
import {ContainerOperationFailedSoloError} from './classes/system/container-operation-failed-solo-error.js';
import {PostgresPodNotFoundSoloError} from './classes/system/postgres-pod-not-found-solo-error.js';
import {InitSystemFilesFailedSoloError} from './classes/system/init-system-files-failed-solo-error.js';
import {CacheProviderNotConfiguredSoloError} from './classes/system/cache-provider-not-configured-solo-error.js';
import {PodTerminationTimeoutSoloError} from './classes/system/pod-termination-timeout-solo-error.js';
import {TimeoutSoloError} from './classes/system/timeout-solo-error.js';
import {ClusterRoleCheckFailedSoloError} from './classes/system/cluster-role-check-failed-solo-error.js';
import {LoggerMessageGroupNotFoundError} from './classes/internal/logger-message-group-not-found-error.js';
import {CommandReturnedFalseError} from './classes/internal/command-returned-false-error.js';
import {RemoteConfigUnsupportedComponentError} from './classes/internal/remote-config-unsupported-component-error.js';
import {RemoteConfigContextUnavailableError} from './classes/internal/remote-config-context-unavailable-error.js';
import {CacheImageTemplateUndeclaredError} from './classes/internal/cache-image-template-undeclared-error.js';
import {InjectedFailureSoloError} from './classes/internal/injected-failure-solo-error.js';
import {PipelineCancelledSoloError} from './classes/internal/pipeline-cancelled-solo-error.js';

/**
 * Registry of typed Solo error constructors, grouped by error code category.
 *
 * To add a new error type:
 * 1. Create `src/core/errors/classes/<category>/<kebab-name>.ts` — a class extending SoloError,
 *    passing a SoloErrorInit with a message, code, and optional troubleshootingSteps.
 * 2. Add the error code constant to `src/core/errors/error-code-registry.ts`.
 * 3. Import the class in this file and add it to the appropriate static namespace below.
 */
export class SoloErrors {
  // 1xxx - Configuration: Local/remote config lifecycle
  public static readonly config: {
    readonly incompleteLocalConfig: typeof IncompleteLocalConfigError;
    readonly localNotFound: typeof LocalConfigNotFoundSoloError;
    readonly refreshLocalConfigSource: typeof RefreshLocalConfigSourceError;
    readonly remoteConfigMissingOnKindCluster: typeof RemoteConfigMissingOnKindClusterError;
    readonly remoteDataInvalid: typeof RemoteConfigDataInvalidSoloError;
    readonly remoteMismatch: typeof RemoteConfigsMismatchSoloError;
    readonly writeLocalConfig: typeof WriteLocalConfigFileError;
    readonly migrateLegacyLocalConfig: typeof MigrateLegacyLocalConfigError;
  } = Object.freeze({
    incompleteLocalConfig: IncompleteLocalConfigError,
    localNotFound: LocalConfigNotFoundSoloError,
    refreshLocalConfigSource: RefreshLocalConfigSourceError,
    remoteDataInvalid: RemoteConfigDataInvalidSoloError,
    remoteConfigMissingOnKindCluster: RemoteConfigMissingOnKindClusterError,
    remoteMismatch: RemoteConfigsMismatchSoloError,
    writeLocalConfig: WriteLocalConfigFileError,
    migrateLegacyLocalConfig: MigrateLegacyLocalConfigError,
  });

  // 2xxx - Deployment / Infrastructure: Cluster, namespace, pod lifecycle
  public static readonly deployment: {
    readonly alreadyExists: typeof DeploymentAlreadyExistsSoloError;
    readonly clusterAddFailed: typeof ClusterAddFailedError;
    readonly clusterRefAlreadyExists: typeof ClusterReferenceAlreadyExistsError;
    readonly clusterRefNotFound: typeof ClusterReferenceNotFoundError;
    readonly clusterReferenceResolutionFailed: typeof ClusterReferenceResolutionFailedError;
    readonly contextNotFoundForCluster: typeof ContextNotFoundForClusterError;
    readonly createFailed: typeof CreateDeploymentSoloError;
    readonly deleteFailed: typeof DeploymentDeleteFailedError;
    readonly hasRemoteResources: typeof DeploymentHasRemoteResourcesError;
    readonly importFailed: typeof DeploymentImportFailedSoloError;
    readonly listFailed: typeof DeploymentListFailedError;
    readonly listPortsFailed: typeof DeploymentListPortsFailedError;
    readonly namespaceNotSet: typeof NamespaceNotSetError;
    readonly noClustersForDeployment: typeof NoClustersForDeploymentError;
    readonly noDeploymentsFound: typeof NoDeploymentsFoundError;
    readonly notFound: typeof DeploymentNotFoundError;
    readonly clusterSetupFailed: typeof ClusterSetupFailedSoloError;
    readonly clusterResetFailed: typeof ClusterResetFailedSoloError;
    readonly minioInstallFailed: typeof MinioInstallFailedSoloError;
    readonly prometheusInstallFailed: typeof PrometheusInstallFailedSoloError;
    readonly metricsServerInstallFailed: typeof MetricsServerInstallFailedSoloError;
    readonly clusterRoleInstallFailed: typeof ClusterRoleInstallFailedSoloError;
    readonly clusterApiServerTimeout: typeof ClusterApiServerTimeoutSoloError;
    readonly kindClusterNetworkSetupFailed: typeof KindClusterNetworkSetupFailedSoloError;
    readonly backupExportFailed: typeof BackupExportFailedSoloError;
    readonly backupImportFailed: typeof BackupImportFailedSoloError;
    readonly backupRestoreClustersFailed: typeof BackupRestoreClustersFailedSoloError;
    readonly deployNetworkFailed: typeof DeployNetworkFailedSoloError;
    readonly blockNodeClusterContextNotFound: typeof BlockNodeClusterContextNotFoundSoloError;
    readonly mirrorNodeClusterContextNotFound: typeof MirrorNodeClusterContextNotFoundSoloError;
  } = Object.freeze({
    alreadyExists: DeploymentAlreadyExistsSoloError,
    clusterAddFailed: ClusterAddFailedError,
    clusterRefAlreadyExists: ClusterReferenceAlreadyExistsError,
    clusterRefNotFound: ClusterReferenceNotFoundError,
    clusterReferenceResolutionFailed: ClusterReferenceResolutionFailedError,
    contextNotFoundForCluster: ContextNotFoundForClusterError,
    createFailed: CreateDeploymentSoloError,
    deleteFailed: DeploymentDeleteFailedError,
    hasRemoteResources: DeploymentHasRemoteResourcesError,
    importFailed: DeploymentImportFailedSoloError,
    listFailed: DeploymentListFailedError,
    listPortsFailed: DeploymentListPortsFailedError,
    namespaceNotSet: NamespaceNotSetError,
    noClustersForDeployment: NoClustersForDeploymentError,
    noDeploymentsFound: NoDeploymentsFoundError,
    notFound: DeploymentNotFoundError,
    clusterSetupFailed: ClusterSetupFailedSoloError,
    clusterResetFailed: ClusterResetFailedSoloError,
    minioInstallFailed: MinioInstallFailedSoloError,
    prometheusInstallFailed: PrometheusInstallFailedSoloError,
    metricsServerInstallFailed: MetricsServerInstallFailedSoloError,
    clusterRoleInstallFailed: ClusterRoleInstallFailedSoloError,
    clusterApiServerTimeout: ClusterApiServerTimeoutSoloError,
    kindClusterNetworkSetupFailed: KindClusterNetworkSetupFailedSoloError,
    backupExportFailed: BackupExportFailedSoloError,
    backupImportFailed: BackupImportFailedSoloError,
    backupRestoreClustersFailed: BackupRestoreClustersFailedSoloError,
    deployNetworkFailed: DeployNetworkFailedSoloError,
    blockNodeClusterContextNotFound: BlockNodeClusterContextNotFoundSoloError,
    mirrorNodeClusterContextNotFound: MirrorNodeClusterContextNotFoundSoloError,
  });

  // 3xxx — Component: Relay, Mirror Node, Explorer, CN runtime
  public static readonly component: {
    readonly nodeTransactionFailed: typeof NodeTransactionFailedSoloError;
    readonly nodeBuildUploadFailed: typeof NodeBuildUploadFailedSoloError;
    readonly nodeBuildCopyFailed: typeof NodeBuildCopyFailedSoloError;
    readonly nodeNotReady: typeof NodeNotReadySoloError;
    readonly nodeJfrExecutionFailed: typeof NodeJfrExecutionFailedSoloError;
    readonly nodeJfrPidNotFound: typeof NodeJfrPidNotFoundSoloError;
    readonly nodeDebugArchiveFailed: typeof NodeDebugArchiveFailedSoloError;
    readonly blockNodeConfigFailed: typeof BlockNodeConfigFailedSoloError;
    readonly blockNodeDeployFailed: typeof BlockNodeDeployFailedSoloError;
    readonly blockNodeDestroyFailed: typeof BlockNodeDestroyFailedSoloError;
    readonly blockNodeJfrCollectionFailed: typeof BlockNodeJfrCollectionFailedSoloError;
    readonly blockNodeUpgradeFailed: typeof BlockNodeUpgradeFailedSoloError;
    readonly blockNodeAddExternalFailed: typeof BlockNodeAddExternalFailedSoloError;
    readonly blockNodeDeleteExternalFailed: typeof BlockNodeDeleteExternalFailedSoloError;
    readonly blockNodeHealthCheckFailed: typeof BlockNodeHealthCheckFailedSoloError;
    readonly chartInstallFailed: typeof ChartInstallFailedSoloError;
    readonly networkDestroyFailed: typeof NetworkDestroyFailedSoloError;
    readonly rapidFireExecutionFailed: typeof RapidFireExecutionSoloError;
    readonly rapidFireLoadStartFailed: typeof RapidFireLoadStartFailedSoloError;
    readonly rapidFireLoadStopFailed: typeof RapidFireLoadStopFailedSoloError;
    readonly rapidFireKillFailed: typeof RapidFireKillFailedSoloError;
    readonly nodeStakeTransactionError: typeof NodeStakeTransactionErrorSoloError;
    readonly nodePrepareUpgradeTransactionError: typeof NodePrepareUpgradeTransactionErrorSoloError;
    readonly nodeFreezeUpgradeTransactionError: typeof NodeFreezeUpgradeTransactionErrorSoloError;
    readonly nodeFreezeTransactionError: typeof NodeFreezeTransactionErrorSoloError;
    readonly nodeUpdateTransactionError: typeof NodeUpdateTransactionErrorSoloError;
    readonly nodeDeleteTransactionError: typeof NodeDeleteTransactionErrorSoloError;
    readonly nodeCreateTransactionError: typeof NodeCreateTransactionErrorSoloError;
    readonly accountBalanceQueryFailed: typeof AccountBalanceQueryFailedSoloError;
    readonly explorerDeployFailed: typeof ExplorerDeployFailedSoloError;
    readonly explorerUpgradeFailed: typeof ExplorerUpgradeFailedSoloError;
    readonly explorerDestroyFailed: typeof ExplorerDestroyFailedSoloError;
    readonly relayDeployFailed: typeof RelayDeployFailedSoloError;
    readonly relayUpgradeFailed: typeof RelayUpgradeFailedSoloError;
    readonly relayDestroyFailed: typeof RelayDestroyFailedSoloError;
    readonly relayNotRunning: typeof RelayNotRunningSoloError;
    readonly relayNotReady: typeof RelayNotReadySoloError;
    readonly relayOperatorKeyRetrievalFailed: typeof RelayOperatorKeyRetrievalFailedSoloError;
    readonly mirrorNodeDeployFailed: typeof MirrorNodeDeployFailedSoloError;
    readonly mirrorNodeUpgradeFailed: typeof MirrorNodeUpgradeFailedSoloError;
    readonly mirrorNodeDestroyFailed: typeof MirrorNodeDestroyFailedSoloError;
    readonly mirrorNodeOperatorKeyRetrievalFailed: typeof MirrorNodeOperatorKeyRetrievalFailedSoloError;
    readonly oneShotDeployFailed: typeof OneShotDeployFailedSoloError;
    readonly oneShotDestroyFailed: typeof OneShotDestroyFailedSoloError;
    readonly oneShotDeploymentInfoRetrievalFailed: typeof OneShotDeploymentInfoRetrievalFailedSoloError;
    readonly falconValuesPreparationFailed: typeof FalconValuesPreparationFailedSoloError;
    readonly accountCreationFailed: typeof AccountCreationFailedSoloError;
    readonly accountKeyUpdateFailed: typeof AccountKeyUpdateFailedSoloError;
    readonly accountKeysBatchUpdateFailed: typeof AccountKeysBatchUpdateFailedSoloError;
    readonly accountTransferFailed: typeof AccountTransferFailedSoloError;
    readonly accountInfoFailed: typeof AccountInfoFailedSoloError;
    readonly accountUpdateFailed: typeof AccountUpdateFailedSoloError;
    readonly accountSecretCreationFailed: typeof AccountSecretCreationFailedSoloError;
    readonly evmAddressRetrievalFailed: typeof EvmAddressRetrievalFailedSoloError;
    readonly nodeAccessConfigFailed: typeof NodeAccessConfigFailedSoloError;
    readonly nodeClientLoadFailed: typeof NodeClientLoadFailedSoloError;
    readonly nodeClientRefreshFailed: typeof NodeClientRefreshFailedSoloError;
    readonly nodeClientSetupFailed: typeof NodeClientSetupFailedSoloError;
    readonly sdkPingFailed: typeof SdkPingFailedSoloError;
    readonly sdkClientNoHealthyNodes: typeof SdkClientNoHealthyNodesSoloError;
    readonly nodeServicesRetrievalFailed: typeof NodeServicesRetrievalFailedSoloError;
    readonly nodeServiceNotFound: typeof NodeServiceNotFoundSoloError;
    readonly gossipKeySecretCreationFailed: typeof GossipKeySecretCreationFailedSoloError;
    readonly gossipKeySecretRestoreFailed: typeof GossipKeySecretRestoreFailedSoloError;
    readonly tlsKeySecretCreationFailed: typeof TlsKeySecretCreationFailedSoloError;
    readonly tlsKeyGenerationFailed: typeof TlsKeyGenerationFailedSoloError;
    readonly signingKeyGenerationFailed: typeof SigningKeyGenerationFailedSoloError;
    readonly nodeKeyLoadFailed: typeof NodeKeyLoadFailedSoloError;
    readonly grpcTlsKeyGenerationFailed: typeof GrpcTlsKeyGenerationFailedSoloError;
    readonly grpcTlsCertMismatch: typeof GrpcTlsCertMismatchSoloError;
    readonly grpcWebTlsCertMismatch: typeof GrpcWebTlsCertMismatchSoloError;
    readonly certificateSecretCreationFailed: typeof CertificateSecretCreationFailedSoloError;
    readonly certificateParsingFailed: typeof CertificateParsingFailedSoloError;
    readonly certificateFileNotFound: typeof CertificateFileNotFoundSoloError;
    readonly explorerTlsSecretCreationFailed: typeof ExplorerTlsSecretCreationFailedSoloError;
    readonly platformFileNotFound: typeof PlatformFileNotFoundSoloError;
    readonly platformFileCopyFailed: typeof PlatformFileCopyFailedSoloError;
    readonly platformKeyFileMissing: typeof PlatformKeyFileMissingSoloError;
    readonly genesisAdminKeySecretFailed: typeof GenesisAdminKeySecretFailedSoloError;
    readonly genesisDataGenerationFailed: typeof GenesisDataGenerationFailedSoloError;
    readonly postgresInitScriptCopyFailed: typeof PostgresInitScriptCopyFailedSoloError;
    readonly postgresInitScriptFailed: typeof PostgresInitScriptFailedSoloError;
    readonly mirrorPasswordSecretMissing: typeof MirrorPasswordSecretMissingSoloError;
    readonly fileContentVerificationFailed: typeof FileContentVerificationFailedSoloError;
    readonly fileContentMismatch: typeof FileContentMismatchSoloError;
    readonly hederaFileCreationFailed: typeof HederaFileCreationFailedSoloError;
    readonly hederaFileUpdateFailed: typeof HederaFileUpdateFailedSoloError;
    readonly hederaFileAppendFailed: typeof HederaFileAppendFailedSoloError;
    readonly nodeStatusEmptyResponse: typeof NodeStatusEmptyResponseSoloError;
    readonly nodeStatusMissingLine: typeof NodeStatusMissingLineSoloError;
    readonly predefinedAccountsCreationFailed: typeof PredefinedAccountsCreationFailedSoloError;
    readonly nodeContainerCrashed: typeof NodeContainerCrashedSoloError;
  } = Object.freeze({
    nodeTransactionFailed: NodeTransactionFailedSoloError,
    nodeBuildUploadFailed: NodeBuildUploadFailedSoloError,
    nodeBuildCopyFailed: NodeBuildCopyFailedSoloError,
    nodeNotReady: NodeNotReadySoloError,
    nodeJfrExecutionFailed: NodeJfrExecutionFailedSoloError,
    nodeJfrPidNotFound: NodeJfrPidNotFoundSoloError,
    nodeDebugArchiveFailed: NodeDebugArchiveFailedSoloError,
    blockNodeConfigFailed: BlockNodeConfigFailedSoloError,
    blockNodeDeployFailed: BlockNodeDeployFailedSoloError,
    blockNodeDestroyFailed: BlockNodeDestroyFailedSoloError,
    blockNodeJfrCollectionFailed: BlockNodeJfrCollectionFailedSoloError,
    blockNodeUpgradeFailed: BlockNodeUpgradeFailedSoloError,
    blockNodeAddExternalFailed: BlockNodeAddExternalFailedSoloError,
    blockNodeDeleteExternalFailed: BlockNodeDeleteExternalFailedSoloError,
    blockNodeHealthCheckFailed: BlockNodeHealthCheckFailedSoloError,
    chartInstallFailed: ChartInstallFailedSoloError,
    networkDestroyFailed: NetworkDestroyFailedSoloError,
    rapidFireExecutionFailed: RapidFireExecutionSoloError,
    rapidFireLoadStartFailed: RapidFireLoadStartFailedSoloError,
    rapidFireLoadStopFailed: RapidFireLoadStopFailedSoloError,
    rapidFireKillFailed: RapidFireKillFailedSoloError,
    nodeStakeTransactionError: NodeStakeTransactionErrorSoloError,
    nodePrepareUpgradeTransactionError: NodePrepareUpgradeTransactionErrorSoloError,
    nodeFreezeUpgradeTransactionError: NodeFreezeUpgradeTransactionErrorSoloError,
    nodeFreezeTransactionError: NodeFreezeTransactionErrorSoloError,
    nodeUpdateTransactionError: NodeUpdateTransactionErrorSoloError,
    nodeDeleteTransactionError: NodeDeleteTransactionErrorSoloError,
    nodeCreateTransactionError: NodeCreateTransactionErrorSoloError,
    accountBalanceQueryFailed: AccountBalanceQueryFailedSoloError,
    explorerDeployFailed: ExplorerDeployFailedSoloError,
    explorerUpgradeFailed: ExplorerUpgradeFailedSoloError,
    explorerDestroyFailed: ExplorerDestroyFailedSoloError,
    relayDeployFailed: RelayDeployFailedSoloError,
    relayUpgradeFailed: RelayUpgradeFailedSoloError,
    relayDestroyFailed: RelayDestroyFailedSoloError,
    relayNotRunning: RelayNotRunningSoloError,
    relayNotReady: RelayNotReadySoloError,
    relayOperatorKeyRetrievalFailed: RelayOperatorKeyRetrievalFailedSoloError,
    mirrorNodeDeployFailed: MirrorNodeDeployFailedSoloError,
    mirrorNodeUpgradeFailed: MirrorNodeUpgradeFailedSoloError,
    mirrorNodeDestroyFailed: MirrorNodeDestroyFailedSoloError,
    mirrorNodeOperatorKeyRetrievalFailed: MirrorNodeOperatorKeyRetrievalFailedSoloError,
    oneShotDeployFailed: OneShotDeployFailedSoloError,
    oneShotDestroyFailed: OneShotDestroyFailedSoloError,
    oneShotDeploymentInfoRetrievalFailed: OneShotDeploymentInfoRetrievalFailedSoloError,
    falconValuesPreparationFailed: FalconValuesPreparationFailedSoloError,
    accountCreationFailed: AccountCreationFailedSoloError,
    accountKeyUpdateFailed: AccountKeyUpdateFailedSoloError,
    accountKeysBatchUpdateFailed: AccountKeysBatchUpdateFailedSoloError,
    accountTransferFailed: AccountTransferFailedSoloError,
    accountInfoFailed: AccountInfoFailedSoloError,
    accountUpdateFailed: AccountUpdateFailedSoloError,
    accountSecretCreationFailed: AccountSecretCreationFailedSoloError,
    evmAddressRetrievalFailed: EvmAddressRetrievalFailedSoloError,
    nodeAccessConfigFailed: NodeAccessConfigFailedSoloError,
    nodeClientLoadFailed: NodeClientLoadFailedSoloError,
    nodeClientRefreshFailed: NodeClientRefreshFailedSoloError,
    nodeClientSetupFailed: NodeClientSetupFailedSoloError,
    sdkPingFailed: SdkPingFailedSoloError,
    sdkClientNoHealthyNodes: SdkClientNoHealthyNodesSoloError,
    nodeServicesRetrievalFailed: NodeServicesRetrievalFailedSoloError,
    nodeServiceNotFound: NodeServiceNotFoundSoloError,
    gossipKeySecretCreationFailed: GossipKeySecretCreationFailedSoloError,
    gossipKeySecretRestoreFailed: GossipKeySecretRestoreFailedSoloError,
    tlsKeySecretCreationFailed: TlsKeySecretCreationFailedSoloError,
    tlsKeyGenerationFailed: TlsKeyGenerationFailedSoloError,
    signingKeyGenerationFailed: SigningKeyGenerationFailedSoloError,
    nodeKeyLoadFailed: NodeKeyLoadFailedSoloError,
    grpcTlsKeyGenerationFailed: GrpcTlsKeyGenerationFailedSoloError,
    grpcTlsCertMismatch: GrpcTlsCertMismatchSoloError,
    grpcWebTlsCertMismatch: GrpcWebTlsCertMismatchSoloError,
    certificateSecretCreationFailed: CertificateSecretCreationFailedSoloError,
    certificateParsingFailed: CertificateParsingFailedSoloError,
    certificateFileNotFound: CertificateFileNotFoundSoloError,
    explorerTlsSecretCreationFailed: ExplorerTlsSecretCreationFailedSoloError,
    platformFileNotFound: PlatformFileNotFoundSoloError,
    platformFileCopyFailed: PlatformFileCopyFailedSoloError,
    platformKeyFileMissing: PlatformKeyFileMissingSoloError,
    genesisAdminKeySecretFailed: GenesisAdminKeySecretFailedSoloError,
    genesisDataGenerationFailed: GenesisDataGenerationFailedSoloError,
    postgresInitScriptCopyFailed: PostgresInitScriptCopyFailedSoloError,
    postgresInitScriptFailed: PostgresInitScriptFailedSoloError,
    mirrorPasswordSecretMissing: MirrorPasswordSecretMissingSoloError,
    fileContentVerificationFailed: FileContentVerificationFailedSoloError,
    fileContentMismatch: FileContentMismatchSoloError,
    hederaFileCreationFailed: HederaFileCreationFailedSoloError,
    hederaFileUpdateFailed: HederaFileUpdateFailedSoloError,
    hederaFileAppendFailed: HederaFileAppendFailedSoloError,
    nodeStatusEmptyResponse: NodeStatusEmptyResponseSoloError,
    nodeStatusMissingLine: NodeStatusMissingLineSoloError,
    predefinedAccountsCreationFailed: PredefinedAccountsCreationFailedSoloError,
    nodeContainerCrashed: NodeContainerCrashedSoloError,
  });

  // 4xxx — Validation: User input, flags, IDs, formatting
  public static readonly validation: {
    readonly blockNodeLocalImageNotFound: typeof BlockNodeLocalImageNotFoundSoloError;
    readonly blockNodeInvalidComponentId: typeof BlockNodeInvalidComponentIdSoloError;
    readonly consensusNodeCountRequired: typeof ConsensusNodeCountRequiredError;
    readonly illegalArgument: typeof IllegalArgumentError;
    readonly invalidOutputFormat: typeof InvalidOutputFormatError;
    readonly invalidPortNumber: typeof InvalidPortNumberError;
    readonly missingArgument: typeof MissingArgumentError;
    readonly localBuildPathNotFound: typeof LocalBuildPathNotFoundSoloError;
    readonly localBuildMissingSubdirectories: typeof LocalBuildMissingSubdirectoriesSoloError;
    readonly localBuildNoJarFiles: typeof LocalBuildNoJarFilesSoloError;
    readonly nodeJarFilesNotInContainer: typeof NodeJarFilesNotInContainerSoloError;
    readonly grpcEndpointsRequired: typeof GrpcEndpointsRequiredSoloError;
    readonly outputDirectoryNotSpecified: typeof OutputDirectoryNotSpecifiedSoloError;
    readonly inputDirectoryNotSpecified: typeof InputDirectoryNotSpecifiedSoloError;
    readonly wrapsKeyPathNotFound: typeof WrapsKeyPathNotFoundSoloError;
    readonly configFileNotFound: typeof ConfigFileNotFoundSoloError;
    readonly nodeVersionMismatch: typeof NodeVersionMismatchSoloError;
    readonly upgradeVersionNotFound: typeof UpgradeVersionNotFoundSoloError;
    readonly pvcFlagNotEnabled: typeof PvcFlagNotEnabledSoloError;
    readonly nonInteractivePrompt: typeof NonInteractivePromptSoloError;
    readonly wrapsVersionConstraint: typeof WrapsVersionConstraintSoloError;
    readonly stateFilePathNotFound: typeof StateFilePathNotFoundSoloError;
    readonly stateFileNotFound: typeof StateFileNotFoundSoloError;
    readonly invalidStateFileFormat: typeof InvalidStateFileFormatSoloError;
    readonly invalidStateZipFileName: typeof InvalidStateZipFileNameSoloError;
    readonly explorerInvalidComponentId: typeof ExplorerInvalidComponentIdSoloError;
    readonly relayInvalidComponentId: typeof RelayInvalidComponentIdSoloError;
    readonly mirrorNodeInvalidComponentId: typeof MirrorNodeInvalidComponentIdSoloError;
    readonly invalidHbarAmount: typeof InvalidHbarAmountSoloError;
    readonly invalidFileIdFormat: typeof InvalidFileIdFormatSoloError;
    readonly invalidEndpointFormat: typeof InvalidEndpointFormatSoloError;
    readonly invalidCommaSeparatedString: typeof InvalidCommaSeparatedStringSoloError;
    readonly invalidConfigNumberValue: typeof InvalidConfigNumberValueSoloError;
    readonly invalidStorageType: typeof InvalidStorageTypeSoloError;
    readonly unsupportedFlagFieldType: typeof UnsupportedFlagFieldTypeSoloError;
    readonly versionDowngradeBlocked: typeof VersionDowngradeBlockedSoloError;
    readonly adminKeysCountMismatch: typeof AdminKeysCountMismatchSoloError;
    readonly componentAlreadyExists: typeof ComponentAlreadyExistsSoloError;
    readonly componentIdRequired: typeof ComponentIdRequiredSoloError;
    readonly componentNotFound: typeof ComponentNotFoundSoloError;
    readonly componentNotInRemoteConfig: typeof ComponentNotInRemoteConfigSoloError;
    readonly unknownComponentType: typeof UnknownComponentTypeSoloError;
    readonly configFileInvalid: typeof ConfigFileInvalidSoloError;
    readonly multipleClustersFound: typeof MultipleClustersFoundSoloError;
    readonly cacheNotMaterialized: typeof CacheNotMaterializedSoloError;
    readonly cacheImageTemplateUnknown: typeof CacheImageTemplateUnknownSoloError;
    readonly invalidKindNodeImage: typeof InvalidKindNodeImageSoloError;
    readonly pathTraversalDetected: typeof PathTraversalDetectedSoloError;
    readonly nodeAliasesMustBeArray: typeof NodeAliasesMustBeArraySoloError;
    readonly unknownNodeAlias: typeof UnknownNodeAliasSoloError;
    readonly nodeAliasInferenceFailed: typeof NodeAliasInferenceFailedSoloError;
    readonly nodeAliasParseFailed: typeof NodeAliasParseFailedSoloError;
    readonly domainNameParseFailed: typeof DomainNameParseFailedSoloError;
    readonly unknownTemplateDependency: typeof UnknownTemplateDependencySoloError;
    readonly noConsensusNodesFound: typeof NoConsensusNodesFoundSoloError;
    readonly serviceTypeMismatch: typeof ServiceTypeMismatchSoloError;
    readonly backupConfigNotFound: typeof BackupConfigNotFoundSoloError;
    readonly backupConfigInvalid: typeof BackupConfigInvalidSoloError;
    readonly backupConfigReadFailed: typeof BackupConfigReadFailedSoloError;
    readonly backupConfigMapKeyMissing: typeof BackupConfigMapKeyMissingSoloError;
    readonly backupConfigParseFailed: typeof BackupConfigParseFailedSoloError;
    readonly backupInputDirectoryNotFound: typeof BackupInputDirectoryNotFoundSoloError;
    readonly backupNoClusterDirs: typeof BackupNoClusterDirectoriesSoloError;
    readonly backupClusterValidationFailed: typeof BackupClusterValidationFailedSoloError;
    readonly backupNoClusterInfo: typeof BackupNoClusterInfoSoloError;
    readonly backupNoComponents: typeof BackupNoComponentsSoloError;
    readonly backupOptionsFileNotFound: typeof BackupOptionsFileNotFoundSoloError;
    readonly backupZipFileRequired: typeof BackupZipFileRequiredSoloError;
    readonly backupInputPathNotFound: typeof BackupInputPathNotFoundSoloError;
    readonly backupInputMustBeZip: typeof BackupInputMustBeZipSoloError;
    readonly backupNoLogFiles: typeof BackupNoLogFilesSoloError;
    readonly backupDatabaseDumpNotFound: typeof BackupDatabaseDumpNotFoundSoloError;
    readonly flagInputFailed: typeof FlagInputFailedSoloError;
    readonly confirmationRequired: typeof ConfirmationRequiredSoloError;
    readonly valuesFileNotFound: typeof ValuesFileNotFoundSoloError;
    readonly valuesFileParseFailed: typeof ValuesFileParseFailedSoloError;
    readonly invalidFlagValue: typeof InvalidFlagValueSoloError;
    readonly transplantRequiresStateFile: typeof TransplantRequiresStateFileSoloError;
  } = Object.freeze({
    blockNodeLocalImageNotFound: BlockNodeLocalImageNotFoundSoloError,
    blockNodeInvalidComponentId: BlockNodeInvalidComponentIdSoloError,
    consensusNodeCountRequired: ConsensusNodeCountRequiredError,
    illegalArgument: IllegalArgumentError,
    invalidOutputFormat: InvalidOutputFormatError,
    invalidPortNumber: InvalidPortNumberError,
    missingArgument: MissingArgumentError,
    localBuildPathNotFound: LocalBuildPathNotFoundSoloError,
    localBuildMissingSubdirectories: LocalBuildMissingSubdirectoriesSoloError,
    localBuildNoJarFiles: LocalBuildNoJarFilesSoloError,
    nodeJarFilesNotInContainer: NodeJarFilesNotInContainerSoloError,
    grpcEndpointsRequired: GrpcEndpointsRequiredSoloError,
    outputDirectoryNotSpecified: OutputDirectoryNotSpecifiedSoloError,
    inputDirectoryNotSpecified: InputDirectoryNotSpecifiedSoloError,
    wrapsKeyPathNotFound: WrapsKeyPathNotFoundSoloError,
    configFileNotFound: ConfigFileNotFoundSoloError,
    nodeVersionMismatch: NodeVersionMismatchSoloError,
    upgradeVersionNotFound: UpgradeVersionNotFoundSoloError,
    pvcFlagNotEnabled: PvcFlagNotEnabledSoloError,
    nonInteractivePrompt: NonInteractivePromptSoloError,
    wrapsVersionConstraint: WrapsVersionConstraintSoloError,
    stateFilePathNotFound: StateFilePathNotFoundSoloError,
    stateFileNotFound: StateFileNotFoundSoloError,
    invalidStateFileFormat: InvalidStateFileFormatSoloError,
    invalidStateZipFileName: InvalidStateZipFileNameSoloError,
    explorerInvalidComponentId: ExplorerInvalidComponentIdSoloError,
    relayInvalidComponentId: RelayInvalidComponentIdSoloError,
    mirrorNodeInvalidComponentId: MirrorNodeInvalidComponentIdSoloError,
    invalidHbarAmount: InvalidHbarAmountSoloError,
    invalidFileIdFormat: InvalidFileIdFormatSoloError,
    invalidEndpointFormat: InvalidEndpointFormatSoloError,
    invalidCommaSeparatedString: InvalidCommaSeparatedStringSoloError,
    invalidConfigNumberValue: InvalidConfigNumberValueSoloError,
    invalidStorageType: InvalidStorageTypeSoloError,
    unsupportedFlagFieldType: UnsupportedFlagFieldTypeSoloError,
    versionDowngradeBlocked: VersionDowngradeBlockedSoloError,
    adminKeysCountMismatch: AdminKeysCountMismatchSoloError,
    componentAlreadyExists: ComponentAlreadyExistsSoloError,
    componentIdRequired: ComponentIdRequiredSoloError,
    componentNotFound: ComponentNotFoundSoloError,
    componentNotInRemoteConfig: ComponentNotInRemoteConfigSoloError,
    unknownComponentType: UnknownComponentTypeSoloError,
    configFileInvalid: ConfigFileInvalidSoloError,
    multipleClustersFound: MultipleClustersFoundSoloError,
    cacheNotMaterialized: CacheNotMaterializedSoloError,
    cacheImageTemplateUnknown: CacheImageTemplateUnknownSoloError,
    invalidKindNodeImage: InvalidKindNodeImageSoloError,
    pathTraversalDetected: PathTraversalDetectedSoloError,
    nodeAliasesMustBeArray: NodeAliasesMustBeArraySoloError,
    unknownNodeAlias: UnknownNodeAliasSoloError,
    nodeAliasInferenceFailed: NodeAliasInferenceFailedSoloError,
    nodeAliasParseFailed: NodeAliasParseFailedSoloError,
    domainNameParseFailed: DomainNameParseFailedSoloError,
    unknownTemplateDependency: UnknownTemplateDependencySoloError,
    noConsensusNodesFound: NoConsensusNodesFoundSoloError,
    serviceTypeMismatch: ServiceTypeMismatchSoloError,
    backupConfigNotFound: BackupConfigNotFoundSoloError,
    backupConfigInvalid: BackupConfigInvalidSoloError,
    backupConfigReadFailed: BackupConfigReadFailedSoloError,
    backupConfigMapKeyMissing: BackupConfigMapKeyMissingSoloError,
    backupConfigParseFailed: BackupConfigParseFailedSoloError,
    backupInputDirectoryNotFound: BackupInputDirectoryNotFoundSoloError,
    backupNoClusterDirs: BackupNoClusterDirectoriesSoloError,
    backupClusterValidationFailed: BackupClusterValidationFailedSoloError,
    backupNoClusterInfo: BackupNoClusterInfoSoloError,
    backupNoComponents: BackupNoComponentsSoloError,
    backupOptionsFileNotFound: BackupOptionsFileNotFoundSoloError,
    backupZipFileRequired: BackupZipFileRequiredSoloError,
    backupInputPathNotFound: BackupInputPathNotFoundSoloError,
    backupInputMustBeZip: BackupInputMustBeZipSoloError,
    backupNoLogFiles: BackupNoLogFilesSoloError,
    backupDatabaseDumpNotFound: BackupDatabaseDumpNotFoundSoloError,
    flagInputFailed: FlagInputFailedSoloError,
    confirmationRequired: ConfirmationRequiredSoloError,
    valuesFileNotFound: ValuesFileNotFoundSoloError,
    valuesFileParseFailed: ValuesFileParseFailedSoloError,
    invalidFlagValue: InvalidFlagValueSoloError,
    transplantRequiresStateFile: TransplantRequiresStateFileSoloError,
  });

  // 5xxx — System / Environment: kubectl, DNS, permissions, timeouts
  public static readonly system: {
    readonly blockNodePodNotFound: typeof BlockNodePodNotFoundSoloError;
    readonly blockNodeNotReady: typeof BlockNodeNotReadySoloError;
    readonly blockNodeNotInRemoteConfig: typeof BlockNodeNotInRemoteConfigSoloError;
    readonly blockNodesJsonEmpty: typeof BlockNodesJsonEmptySoloError;
    readonly externalBlockNodeNotInRemoteConfig: typeof ExternalBlockNodeNotInRemoteConfigSoloError;
    readonly clusterConnectionFailed: typeof ClusterConnectionFailedError;
    readonly clusterUnreachable: typeof ClusterUnreachableError;
    readonly kindClusterStopped: typeof KindClusterStoppedError;
    readonly containerEngineNotRunning: typeof ContainerEngineNotRunningError;
    readonly githubApiHttpResponseError: typeof GitHubApiHttpResponseError;
    readonly githubApiRequestFailed: typeof GitHubApiRequestFailedError;
    readonly githubApiResponseMissingTagName: typeof GitHubApiResponseMissingTagNameError;
    readonly githubApiResponseParseFailed: typeof GitHubApiResponseParseFailedError;
    readonly portForwardRefreshFailed: typeof PortForwardRefreshFailedError;
    readonly portForwardStopFailed: typeof PortForwardStopFailedError;
    readonly portForwardStatusFailed: typeof PortForwardStatusFailedError;
    readonly resourceNotFound: typeof ResourceNotFoundError;
    readonly namespaceNotFound: typeof NamespaceNotFoundSoloError;
    readonly podNotFound: typeof PodNotFoundSoloError;
    readonly haproxyPodsNotFound: typeof HaproxyPodsNotFoundSoloError;
    readonly loadBalancerNotFound: typeof LoadBalancerNotFoundSoloError;
    readonly kubeContextNotFound: typeof KubeContextNotFoundSoloError;
    readonly consensusNodeNotInConfig: typeof ConsensusNodeNotInConfigSoloError;
    readonly k8sSecretCreateFailed: typeof K8sSecretCreateFailedSoloError;
    readonly statesDirectoryNotFound: typeof StatesDirectoryNotFoundSoloError;
    readonly portForwardMissing: typeof PortForwardMissingSoloError;
    readonly noPvcFound: typeof NoPvcFoundSoloError;
    readonly clusterReferenceUndetermined: typeof ClusterReferenceUndeterminedSoloError;
    readonly upgradeVersionFetchFailed: typeof UpgradeVersionFetchFailedSoloError;
    readonly multipleDeploymentsFound: typeof MultipleDeploymentsFoundSoloError;
    readonly grpcProxyEndpointFailed: typeof GrpcProxyEndpointFailedSoloError;
    readonly explorerPodNotFound: typeof ExplorerPodNotFoundSoloError;
    readonly explorerNotInRemoteConfig: typeof ExplorerNotInRemoteConfigSoloError;
    readonly relayPodNotFound: typeof RelayPodNotFoundSoloError;
    readonly relayNotInRemoteConfig: typeof RelayNotInRemoteConfigSoloError;
    readonly mirrorNodePodsNotFound: typeof MirrorNodePodsNotFoundSoloError;
    readonly mirrorIngressControllerPodNotFound: typeof MirrorIngressControllerPodNotFoundSoloError;
    readonly mirrorNodeNotInRemoteConfig: typeof MirrorNodeNotInRemoteConfigSoloError;
    readonly clusterNotFoundInRemoteConfig: typeof ClusterNotFoundInRemoteConfigSoloError;
    readonly helmRepoSetupFailed: typeof HelmRepoSetupFailedSoloError;
    readonly helmRepoCheckFailed: typeof HelmRepoCheckFailedSoloError;
    readonly helmChartListFailed: typeof HelmChartListFailedSoloError;
    readonly helmChartGenericInstallFailed: typeof HelmChartGenericInstallFailedSoloError;
    readonly helmChartUninstallFailed: typeof HelmChartUninstallFailedSoloError;
    readonly helmChartUpgradeFailed: typeof HelmChartUpgradeFailedSoloError;
    readonly helmChartPullNoArchive: typeof HelmChartPullNoArchiveSoloError;
    readonly fileNotFound: typeof FileNotFoundSoloError;
    readonly fileCopyFailed: typeof FileCopyFailedSoloError;
    readonly fileEmpty: typeof FileEmptySoloError;
    readonly fileInvalidJson: typeof FileInvalidJsonSoloError;
    readonly directoryCreationFailed: typeof DirectoryCreationFailedSoloError;
    readonly archiveUnzipFailed: typeof ArchiveUnzipFailedSoloError;
    readonly archiveTarFailed: typeof ArchiveTarFailedSoloError;
    readonly archiveUntarFailed: typeof ArchiveUntarFailedSoloError;
    readonly dependencyVersionCheckFailed: typeof DependencyVersionCheckFailedSoloError;
    readonly dependencyNotFound: typeof DependencyNotFoundSoloError;
    readonly dependencyManagerNotFound: typeof DependencyManagerNotFoundSoloError;
    readonly dependencyInstallFailed: typeof DependencyInstallFailedSoloError;
    readonly dependencyInstallDirectoryConflict: typeof DependencyInstallDirectoryConflictSoloError;
    readonly gitHubReleasesNotFound: typeof GitHubReleasesNotFoundSoloError;
    readonly gitHubReleaseTagNotFound: typeof GitHubReleaseTagNotFoundSoloError;
    readonly gitHubReleaseAssetNotFound: typeof GitHubReleaseAssetNotFoundSoloError;
    readonly homebrewInstallFailed: typeof HomebrewInstallFailedSoloError;
    readonly unsupportedLinuxDistribution: typeof UnsupportedLinuxDistributionSoloError;
    readonly podmanMachineInspectFailed: typeof PodmanMachineInspectFailedSoloError;
    readonly podmanRuntimeConfigurationFailed: typeof PodmanRuntimeConfigurationFailedSoloError;
    readonly podNotReady: typeof PodNotReadySoloError;
    readonly dockerAuthStale: typeof DockerAuthStaleSoloError;
    readonly pvcCreationFailed: typeof PvcCreationFailedSoloError;
    readonly kubernetesApiInvalidResponse: typeof KubernetesApiInvalidResponseSoloError;
    readonly ingressClassListFailed: typeof IngressClassListFailedSoloError;
    readonly multipleItemsFound: typeof MultipleItemsFoundSoloError;
    readonly podCreationFailed: typeof PodCreationFailedSoloError;
    readonly packageDownloadFailed: typeof PackageDownloadFailedSoloError;
    readonly checksumReadFailed: typeof ChecksumReadFailedSoloError;
    readonly containerInvalidPath: typeof ContainerInvalidPathSoloError;
    readonly containerOperationFailed: typeof ContainerOperationFailedSoloError;
    readonly postgresPodNotFound: typeof PostgresPodNotFoundSoloError;
    readonly initSystemFilesFailed: typeof InitSystemFilesFailedSoloError;
    readonly cacheProviderNotConfigured: typeof CacheProviderNotConfiguredSoloError;
    readonly podTerminationTimeout: typeof PodTerminationTimeoutSoloError;
    readonly timeout: typeof TimeoutSoloError;
    readonly clusterRoleCheckFailed: typeof ClusterRoleCheckFailedSoloError;
    readonly minioOperatorCrdsOrphaned: typeof MinioOperatorCrdsOrphanedSoloError;
  } = Object.freeze({
    minioOperatorCrdsOrphaned: MinioOperatorCrdsOrphanedSoloError,
    blockNodePodNotFound: BlockNodePodNotFoundSoloError,
    blockNodeNotReady: BlockNodeNotReadySoloError,
    blockNodeNotInRemoteConfig: BlockNodeNotInRemoteConfigSoloError,
    blockNodesJsonEmpty: BlockNodesJsonEmptySoloError,
    externalBlockNodeNotInRemoteConfig: ExternalBlockNodeNotInRemoteConfigSoloError,
    clusterConnectionFailed: ClusterConnectionFailedError,
    clusterUnreachable: ClusterUnreachableError,
    kindClusterStopped: KindClusterStoppedError,
    containerEngineNotRunning: ContainerEngineNotRunningError,
    githubApiHttpResponseError: GitHubApiHttpResponseError,
    githubApiRequestFailed: GitHubApiRequestFailedError,
    githubApiResponseMissingTagName: GitHubApiResponseMissingTagNameError,
    githubApiResponseParseFailed: GitHubApiResponseParseFailedError,
    portForwardRefreshFailed: PortForwardRefreshFailedError,
    portForwardStopFailed: PortForwardStopFailedError,
    portForwardStatusFailed: PortForwardStatusFailedError,
    resourceNotFound: ResourceNotFoundError,
    namespaceNotFound: NamespaceNotFoundSoloError,
    podNotFound: PodNotFoundSoloError,
    haproxyPodsNotFound: HaproxyPodsNotFoundSoloError,
    loadBalancerNotFound: LoadBalancerNotFoundSoloError,
    kubeContextNotFound: KubeContextNotFoundSoloError,
    consensusNodeNotInConfig: ConsensusNodeNotInConfigSoloError,
    k8sSecretCreateFailed: K8sSecretCreateFailedSoloError,
    statesDirectoryNotFound: StatesDirectoryNotFoundSoloError,
    portForwardMissing: PortForwardMissingSoloError,
    noPvcFound: NoPvcFoundSoloError,
    clusterReferenceUndetermined: ClusterReferenceUndeterminedSoloError,
    upgradeVersionFetchFailed: UpgradeVersionFetchFailedSoloError,
    multipleDeploymentsFound: MultipleDeploymentsFoundSoloError,
    grpcProxyEndpointFailed: GrpcProxyEndpointFailedSoloError,
    explorerPodNotFound: ExplorerPodNotFoundSoloError,
    explorerNotInRemoteConfig: ExplorerNotInRemoteConfigSoloError,
    relayPodNotFound: RelayPodNotFoundSoloError,
    relayNotInRemoteConfig: RelayNotInRemoteConfigSoloError,
    mirrorNodePodsNotFound: MirrorNodePodsNotFoundSoloError,
    mirrorIngressControllerPodNotFound: MirrorIngressControllerPodNotFoundSoloError,
    mirrorNodeNotInRemoteConfig: MirrorNodeNotInRemoteConfigSoloError,
    clusterNotFoundInRemoteConfig: ClusterNotFoundInRemoteConfigSoloError,
    helmRepoSetupFailed: HelmRepoSetupFailedSoloError,
    helmRepoCheckFailed: HelmRepoCheckFailedSoloError,
    helmChartListFailed: HelmChartListFailedSoloError,
    helmChartGenericInstallFailed: HelmChartGenericInstallFailedSoloError,
    helmChartUninstallFailed: HelmChartUninstallFailedSoloError,
    helmChartUpgradeFailed: HelmChartUpgradeFailedSoloError,
    helmChartPullNoArchive: HelmChartPullNoArchiveSoloError,
    fileNotFound: FileNotFoundSoloError,
    fileCopyFailed: FileCopyFailedSoloError,
    fileEmpty: FileEmptySoloError,
    fileInvalidJson: FileInvalidJsonSoloError,
    directoryCreationFailed: DirectoryCreationFailedSoloError,
    archiveUnzipFailed: ArchiveUnzipFailedSoloError,
    archiveTarFailed: ArchiveTarFailedSoloError,
    archiveUntarFailed: ArchiveUntarFailedSoloError,
    dependencyVersionCheckFailed: DependencyVersionCheckFailedSoloError,
    dependencyNotFound: DependencyNotFoundSoloError,
    dependencyManagerNotFound: DependencyManagerNotFoundSoloError,
    dependencyInstallFailed: DependencyInstallFailedSoloError,
    dependencyInstallDirectoryConflict: DependencyInstallDirectoryConflictSoloError,
    gitHubReleasesNotFound: GitHubReleasesNotFoundSoloError,
    gitHubReleaseTagNotFound: GitHubReleaseTagNotFoundSoloError,
    gitHubReleaseAssetNotFound: GitHubReleaseAssetNotFoundSoloError,
    homebrewInstallFailed: HomebrewInstallFailedSoloError,
    unsupportedLinuxDistribution: UnsupportedLinuxDistributionSoloError,
    podmanMachineInspectFailed: PodmanMachineInspectFailedSoloError,
    podmanRuntimeConfigurationFailed: PodmanRuntimeConfigurationFailedSoloError,
    podNotReady: PodNotReadySoloError,
    dockerAuthStale: DockerAuthStaleSoloError,
    pvcCreationFailed: PvcCreationFailedSoloError,
    kubernetesApiInvalidResponse: KubernetesApiInvalidResponseSoloError,
    ingressClassListFailed: IngressClassListFailedSoloError,
    multipleItemsFound: MultipleItemsFoundSoloError,
    podCreationFailed: PodCreationFailedSoloError,
    packageDownloadFailed: PackageDownloadFailedSoloError,
    checksumReadFailed: ChecksumReadFailedSoloError,
    containerInvalidPath: ContainerInvalidPathSoloError,
    containerOperationFailed: ContainerOperationFailedSoloError,
    postgresPodNotFound: PostgresPodNotFoundSoloError,
    initSystemFilesFailed: InitSystemFilesFailedSoloError,
    cacheProviderNotConfigured: CacheProviderNotConfiguredSoloError,
    podTerminationTimeout: PodTerminationTimeoutSoloError,
    timeout: TimeoutSoloError,
    clusterRoleCheckFailed: ClusterRoleCheckFailedSoloError,
  });

  // 9xxx — Internal: Unexpected bugs, unimplemented paths
  public static readonly internal: {
    readonly unsupportedOperation: typeof UnsupportedOperationError;
    readonly readRemoteConfigBeforeLoad: typeof ReadRemoteConfigBeforeLoadError;
    readonly writeRemoteConfigBeforeLoad: typeof WriteRemoteConfigBeforeLoadError;
    readonly dataValidation: typeof DataValidationError;
    readonly loggerMessageGroupNotFound: typeof LoggerMessageGroupNotFoundError;
    readonly commandReturnedFalse: typeof CommandReturnedFalseError;
    readonly remoteConfigUnsupportedComponent: typeof RemoteConfigUnsupportedComponentError;
    readonly remoteConfigContextUnavailable: typeof RemoteConfigContextUnavailableError;
    readonly cacheImageTemplateUndeclared: typeof CacheImageTemplateUndeclaredError;
    readonly injectedFailure: typeof InjectedFailureSoloError;
    readonly pipelineCancelled: typeof PipelineCancelledSoloError;
  } = Object.freeze({
    unsupportedOperation: UnsupportedOperationError,
    readRemoteConfigBeforeLoad: ReadRemoteConfigBeforeLoadError,
    writeRemoteConfigBeforeLoad: WriteRemoteConfigBeforeLoadError,
    dataValidation: DataValidationError,
    loggerMessageGroupNotFound: LoggerMessageGroupNotFoundError,
    commandReturnedFalse: CommandReturnedFalseError,
    remoteConfigUnsupportedComponent: RemoteConfigUnsupportedComponentError,
    remoteConfigContextUnavailable: RemoteConfigContextUnavailableError,
    cacheImageTemplateUndeclared: CacheImageTemplateUndeclaredError,
    injectedFailure: InjectedFailureSoloError,
    pipelineCancelled: PipelineCancelledSoloError,
  });
}
