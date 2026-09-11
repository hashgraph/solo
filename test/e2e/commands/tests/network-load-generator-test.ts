// SPDX-License-Identifier: Apache-2.0

import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import * as constants from '../../../../src/core/constants.js';
import {type ChartManager} from '../../../../src/core/chart-manager.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {HelmChartValues} from '../../../../src/integration/helm/model/values.js';
import {SemanticVersion} from '../../../../src/business/utils/semantic-version.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type Deployment} from '../../../../src/business/runtime-state/config/local/deployment.js';
import {type Pod} from '../../../../src/integration/kube/resources/pod/pod.js';
import {ContainerReference} from '../../../../src/integration/kube/resources/container/container-reference.js';
import {type Containers} from '../../../../src/integration/kube/resources/container/containers.js';
import {NetworkLoadGeneratorLibraries} from '../../../../src/core/network-load-generator-libraries.js';
import {
  HEDERA_PLATFORM_VERSION,
  MINIMUM_HIERO_PLATFORM_VERSION_FOR_NETWORK_LOAD_GENERATOR,
  NETWORK_LOAD_GENERATOR_CHART_VERSION_AFTER_CN_72,
  NETWORK_LOAD_GENERATOR_CHART_VERSION_BEFORE_CN_72,
} from '../../../../version.js';

export class NetworkLoadGeneratorTest {
  /**
   * Deploy the NLG Helm chart directly (bypassing rapid-fire) so the chart install, pod readiness and the
   * libsodium install run under their own mocha timeout instead of inside the first load test (#5988).
   *
   * This mirrors the deployment logic in RapidFireCommand.deployNlgChart(); rapid-fire skips its own
   * deploy step when it finds the chart already installed.
   */
  public static async deployChart(deploymentName: string): Promise<void> {
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    await localConfig.load();
    const deployment: Deployment = localConfig.configuration.deploymentByName(deploymentName);
    const namespace: NamespaceName = NamespaceName.of(deployment.namespace);
    // Resolve the context from the deployment's cluster reference, as rapid-fire does. The suite's
    // contexts[] come from SOLO_TEST_CLUSTER, which one-shot ignores when it creates its own kind cluster.
    const kubeContext: string = localConfig.configuration.clusterRefs
      .get(deployment.clusters.get(0).toString())
      .toString();

    const chartManager: ChartManager = container.resolve<ChartManager>(InjectTokens.ChartManager);
    const k8Factory: K8Factory = container.resolve<K8Factory>(InjectTokens.K8Factory);
    const k8Instance: K8 = k8Factory.getK8(kubeContext);

    // Build values argument with HAProxy pod IPs (same as rapid-fire does)
    const chartValues: HelmChartValues = new HelmChartValues().file(constants.RAPID_FIRE_VALUES_FILE);

    const haproxyPods: Pod[] = await k8Instance.pods().list(namespace, ['solo.hedera.com/type=haproxy']);

    const port: number = constants.GRPC_PORT;
    const networkProperties: string[] = haproxyPods.map((pod: Pod): string => {
      const accountId: string = pod.labels['solo.hedera.com/account-id'] ?? 'unknown';
      // eslint-disable-next-line unicorn/prefer-string-raw
      return `${pod.podIp}\\:${port}=${accountId}`;
    });

    for (const [index, row] of networkProperties.entries()) {
      chartValues.setLiteral(`loadGenerator.properties[${index}]`, row);
    }

    await chartManager.install(
      namespace,
      constants.NETWORK_LOAD_GENERATOR_RELEASE_NAME,
      constants.NETWORK_LOAD_GENERATOR_CHART,
      constants.NETWORK_LOAD_GENERATOR_CHART_URL,
      new SemanticVersion(HEDERA_PLATFORM_VERSION).greaterThanOrEqual(
        new SemanticVersion(MINIMUM_HIERO_PLATFORM_VERSION_FOR_NETWORK_LOAD_GENERATOR),
      )
        ? NETWORK_LOAD_GENERATOR_CHART_VERSION_AFTER_CN_72
        : NETWORK_LOAD_GENERATOR_CHART_VERSION_BEFORE_CN_72,
      chartValues,
      kubeContext,
    );

    await k8Instance
      .pods()
      .waitForReadyStatus(
        namespace,
        constants.NETWORK_LOAD_GENERATOR_POD_LABELS,
        constants.NETWORK_LOAD_GENERATOR_POD_RUNNING_MAX_ATTEMPTS,
        constants.NETWORK_LOAD_GENERATOR_POD_RUNNING_DELAY,
      );

    const nlgPods: Pod[] = await k8Instance.pods().list(namespace, constants.NETWORK_LOAD_GENERATOR_POD_LABELS);
    const k8Containers: Containers = k8Instance.containers();
    for (const pod of nlgPods) {
      const containerReference: ContainerReference = ContainerReference.of(
        pod.podReference,
        constants.NETWORK_LOAD_GENERATOR_CONTAINER,
      );
      await NetworkLoadGeneratorLibraries.install(k8Containers.readByRef(containerReference));
    }
  }
}
