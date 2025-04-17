// SPDX-License-Identifier: Apache-2.0

import {TransformationType, type TransformFnParams} from 'class-transformer';
import {type DeploymentPhase} from '../remote/deployment-phase.js';
import {SemVer} from 'semver';
import {type LedgerPhase} from '../remote/ledger-phase.js';
import {UnsupportedOperationError} from '../../../../business/errors/unsupported-operation-error.js';

export class Transformations {
  private constructor() {
    throw new UnsupportedOperationError('This class cannot be instantiated');
  }

  public static readonly SemVer = ({value, type}: TransformFnParams) => {
    switch (type) {
      case TransformationType.PLAIN_TO_CLASS: {
        return new SemVer(value);
      }
      case TransformationType.CLASS_TO_PLAIN: {
        return value.toString();
      }
      default: {
        return value;
      }
    }
  };

  public static readonly DeploymentPhase = ({value, type}: TransformFnParams) => {
    switch (type) {
      case TransformationType.PLAIN_TO_CLASS: {
        return (value as string)?.trim().toLowerCase().replace('_', '-') as DeploymentPhase;
      }
      case TransformationType.CLASS_TO_PLAIN: {
        return value.toString();
      }
      default: {
        return value;
      }
    }
  };

  public static readonly LedgerPhase = ({value, type}: TransformFnParams) => {
    switch (type) {
      case TransformationType.PLAIN_TO_CLASS: {
        return (value as string)?.trim().toLowerCase().replace('_', '-') as LedgerPhase;
      }
      case TransformationType.CLASS_TO_PLAIN: {
        return value.toString();
      }
      default: {
        return value;
      }
    }
  };
}
