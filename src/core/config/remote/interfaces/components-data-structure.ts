// SPDX-License-Identifier: Apache-2.0

import {type ComponentTypes} from '../enumerations/component-types.js';
import {type BaseComponentStructure} from '../components/interfaces/base-component-structure.js';
import {type ComponentName} from '../types.js';

export type ComponentsDataStructure = Record<ComponentTypes, Record<ComponentName, BaseComponentStructure>>;
