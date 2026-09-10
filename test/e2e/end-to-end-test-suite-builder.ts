// SPDX-License-Identifier: Apache-2.0

import {EndToEndTestSuite} from './end-to-end-test-suite.js';
import {NamespaceName} from '../../src/types/namespace/namespace-name.js';
import {type DeploymentName} from '../../src/types/index.js';

export class EndToEndTestSuiteBuilder {
  private testName: string;
  private testSuiteName: string;
  private namespace: NamespaceName;
  private deployment: DeploymentName;
  private clusterCount: number;
  private consensusNodesCount: number;
  private loadBalancerEnabled: boolean;
  private tssEnabled: boolean = true;
  private wrapsEnabled: boolean;
  private pinger: boolean;
  private realm: number;
  private shard: number;
  private serviceMonitor: boolean;
  private podLog: boolean;
  private minimalSetup: boolean;
  private collectDiagnosticLogs: boolean = true; // Default to true
  private apiPermissionProperties: string;
  private applicationEnvironment: string;
  private applicationProperties: string;
  private bootstrapProperties: string;
  private logXml: string;
  private settingsTxt: string;
  private javaFlightRecorderConfiguration: string;
  private chainId: number;

  private testSuiteCallback: (
    endToEndTestSuite: EndToEndTestSuite,
    preDestroy: (endToEndTestSuiteInstance: EndToEndTestSuite) => Promise<void>,
  ) => void;

  public withTestName(testName: string): this {
    this.testName = testName;
    return this;
  }

  public withTestSuiteName(testSuiteName: string): this {
    this.testSuiteName = testSuiteName;
    return this;
  }

  public withNamespace(namespace: string): this {
    this.namespace = NamespaceName.of(namespace);
    return this;
  }

  public withDeployment(deployment: DeploymentName): this {
    this.deployment = deployment;
    return this;
  }

  public withClusterCount(clusterCount: number): this {
    this.clusterCount = clusterCount;
    return this;
  }

  public withConsensusNodesCount(consensusNodesCount: number): this {
    this.consensusNodesCount = consensusNodesCount;
    return this;
  }

  public withLoadBalancerEnabled(loadBalancerEnabled: boolean): this {
    this.loadBalancerEnabled = loadBalancerEnabled;
    return this;
  }

  public withTssEnabled(tssEnabled: boolean): this {
    this.tssEnabled = tssEnabled;
    return this;
  }

  public withWrapsEnabled(wrapsEnabled: boolean): this {
    this.wrapsEnabled = wrapsEnabled;
    return this;
  }

  public withPinger(pinger: boolean): this {
    this.pinger = pinger;
    return this;
  }

  public withRealm(realm: number): this {
    this.realm = realm;
    return this;
  }

  public withShard(shard: number): this {
    this.shard = shard;
    return this;
  }

  public withServiceMonitor(serviceMonitor: boolean): this {
    this.serviceMonitor = serviceMonitor;
    return this;
  }

  public withPodLog(podLog: boolean): this {
    this.podLog = podLog;
    return this;
  }

  public withMinimalSetup(minimalSetup: boolean): this {
    this.minimalSetup = minimalSetup;
    return this;
  }

  public withTestSuiteCallback(
    testSuiteCallback: (
      endToEndTestSuite: EndToEndTestSuite,
      preDestroy: (endToEndTestSuiteInstance: EndToEndTestSuite) => Promise<void>,
    ) => void,
  ): this {
    this.testSuiteCallback = testSuiteCallback;
    return this;
  }

  public withCollectDiagnosticLogs(collectDiagnosticLogs: boolean): this {
    this.collectDiagnosticLogs = collectDiagnosticLogs;
    return this;
  }

  public withApiPermissionProperties(fileName: string): this {
    this.apiPermissionProperties = fileName;
    return this;
  }

  public withApplicationEnvironment(fileName: string): this {
    this.applicationEnvironment = fileName;
    return this;
  }

  public withApplicationProperties(fileName: string): this {
    this.applicationProperties = fileName;
    return this;
  }

  public withBootstrapProperties(fileName: string): this {
    this.bootstrapProperties = fileName;
    return this;
  }

  public withLog4j2Xml(fileName: string): this {
    this.logXml = fileName;
    return this;
  }

  public withSettingsTxt(fileName: string): this {
    this.settingsTxt = fileName;
    return this;
  }

  public withJavaFlightRecorderConfiguration(jfc: string): this {
    this.javaFlightRecorderConfiguration = jfc;
    return this;
  }

  public withChainId(chainId: number): this {
    this.chainId = chainId;
    return this;
  }

  public build(): EndToEndTestSuite {
    if (!this.testName || !this.testSuiteName || !this.testSuiteCallback) {
      throw new Error('Missing required properties to build EndToEndTestSuite');
    }
    return new EndToEndTestSuite(
      this.testName,
      this.testSuiteName,
      this.namespace,
      this.deployment,
      this.clusterCount || 1, // Default to 1 if not specified
      this.consensusNodesCount || 1,
      this.loadBalancerEnabled || false,
      this.tssEnabled,
      this.wrapsEnabled || false,
      this.pinger || false,
      this.realm || 0,
      this.shard || 0,
      this.serviceMonitor || false,
      this.podLog || false,
      this.minimalSetup || false,
      this.collectDiagnosticLogs,
      this.apiPermissionProperties,
      this.applicationEnvironment,
      this.applicationProperties,
      this.bootstrapProperties,
      this.logXml,
      this.settingsTxt,
      this.javaFlightRecorderConfiguration,
      this.chainId || 0,
      this.testSuiteCallback,
    );
  }
}
