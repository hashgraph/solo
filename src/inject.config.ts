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

import { Container, type interfaces } from 'inversify'
import { LocalConfig } from './core/config/LocalConfig.ts'
import path from 'path'
import { constants } from './core/index.ts'
import { logging } from './core/index.ts'
import { INJECTABLES } from './types/injectables.ts'
import { type SoloLogger } from './core/logging.js'

export const container = new Container()

container.bind<LocalConfig>(INJECTABLES.LocalConfig).toDynamicValue((context: interfaces.Context) => {
    return new LocalConfig(path.join(constants.SOLO_CACHE_DIR, constants.DEFAULT_LOCAL_CONFIG_FILE))
}).inSingletonScope()

container.bind<SoloLogger>(INJECTABLES.SoloLogger).toDynamicValue((context: interfaces.Context) => {
    return logging.NewLogger('debug')
}).inSingletonScope()