// SPDX-License-Identifier: Apache-2.0

import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type NlgResult} from './nlg-result.js';

export interface RapidFireFailureDiagnostics {
  context: string;
  namespace: NamespaceName;
  testClass: string;
  stdoutText: string;
  stderrText: string;
  result: NlgResult;
  execError?: Error;
}
