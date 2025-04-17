// SPDX-License-Identifier: Apache-2.0

import {type ComponentTypes} from '../enumerations/component-types.js';
import {type BaseComponentStruct} from '../components/interfaces/base-component-struct.js';
import {type ComponentId} from '../types.js';

export type ComponentsDataStruct = Record<ComponentTypes, Record<ComponentId, BaseComponentStruct>>;
