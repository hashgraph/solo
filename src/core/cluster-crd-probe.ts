// SPDX-License-Identifier: Apache-2.0

import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type Context} from '../types/index.js';

/**
 * Asks a cluster which of a set of CRDs are already present.
 *
 * Several charts Solo installs ship cluster-scoped CRDs that may already exist — installed by another
 * chart, by the user, or left behind by a namespace that was deleted. Each caller previously walked its
 * own CRD list; this keeps the question, and the shape of the answer, in one place.
 */
export class ClusterCrdProbe {
  /**
   * Reads the labels of each named CRD, keeping only the ones that exist.
   *
   * Labels rather than a bare existence check: `SharedClusterResourceReport.versionFromLabels()` turns
   * them into the version string the reports show, so the caller can say *which* version it found rather
   * than only that something was there.
   *
   * @param k8Factory - factory for the cluster client
   * @param context - the kube context to query
   * @param crdNames - fully qualified CRD names, e.g. `tenants.minio.min.io`
   * @returns the present CRDs, in the order given, mapped to their labels
   */
  public static async probe(
    k8Factory: K8Factory,
    context: Context,
    crdNames: readonly string[],
  ): Promise<Map<string, Record<string, string>>> {
    const present: Map<string, Record<string, string>> = new Map();

    for (const crdName of crdNames) {
      const labels: Record<string, string> | undefined = await k8Factory.getK8(context).crds().readLabels(crdName);
      if (labels !== undefined) {
        present.set(crdName, labels);
      }
    }

    return present;
  }
}
