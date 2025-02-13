/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type EmailAddress} from '../remote/types.js';
import {type DataObject} from './data_object.js';

export interface User extends DataObject<User> {
  name: string;
  email: EmailAddress;
}
