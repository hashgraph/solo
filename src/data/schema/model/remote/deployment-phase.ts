// SPDX-License-Identifier: Apache-2.0

/**
 * The deployment state of an application (eg: Consensus Node, Mirror Node, Explorer, Relay, etc).
 */
export enum DeploymentPhase {
  /**
   * The application has been requested/scheduled for deployment, but has not yet been deployed.
   * This state is the initial phase for all applications.
   */
  REQUESTED = 'requested',

  /**
   * The application has been deployed. For some applications, this is the final state.
   * For others, additional steps are required to start the application.
   */
  DEPLOYED = 'deployed',

  /**
   * The application has been deployed and has been initialized. The application is ready to be started.
   * This only applies to applications, such as the consensus node, which require an initialization step.
   */
  CONFIGURED = 'configured',

  /**
   * The application has been deployed and a request to start it has been executed.
   * This only applies to applications, such as the consensus node, which require a separate start command.
   */
  STARTED = 'started',

  /**
   * The application has been deployed and a request to stop it has been executed.
   * This only applies to applications, such as the consensus node, which require a separate start command.
   */
  STOPPED = 'stopped',

  /**
   * The ledger has been sent a freeze transaction.
   * This only applies to the consensus node.
   */
  FROZEN = 'frozen',
}
