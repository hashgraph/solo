/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

export enum NodeStatusCodes {
  NO_VALUE = 0,
  STARTING_UP = 1,
  ACTIVE = 2,
  BEHIND = 4,
  FREEZING = 5,
  FREEZE_COMPLETE = 6,
  REPLAYING_EVENTS = 7,
  OBSERVING = 8,
  CHECKING = 9,
  RECONNECT_COMPLETE = 10,
  CATASTROPHIC_FAILURE = 11
}

export const NodeStatusEnums = {
  0: 'NO_VALUE',
  1: 'STARTING_UP',
  2: 'ACTIVE',
  4: 'BEHIND',
  5: 'FREEZING',
  6: 'FREEZE_COMPLETE',
  7: 'REPLAYING_EVENTS',
  8: 'OBSERVING',
  9: 'CHECKING',
  10: 'RECONNECT_COMPLETE',
  11: 'CATASTROPHIC_FAILURE'
}
