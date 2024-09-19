expect(mirrorNodeCmd.getUnusedConfigs(MirrorNodeCommand.DEPLOY_CONFIGS_NAME)).toEqual([
  flags.hederaExplorerTlsHostName.constName,
  flags.hederaExplorerTlsLoadBalancerIp.constName,
  flags.profileFile.constName,
  flags.profileName.constName,
  flags.tlsClusterIssuerType.constName
])
