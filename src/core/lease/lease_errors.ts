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
import { SoloError } from '../errors.ts'

export class LeaseAcquisitionError extends SoloError {
    /**
     * Instantiates a new error with a message and an optional cause.
     *
     * @param message - the error message to be reported.
     * @param cause - optional underlying cause of the error.
     * @param meta - optional metadata to be reported.
     */
    public constructor (message: string, cause: Error | any = {}, meta: any = {}) {
        super(message, cause, meta)
    }
}

export class LeaseRelinquishmentError extends SoloError {
    /**
     * Instantiates a new error with a message and an optional cause.
     *
     * @param message - the error message to be reported.
     * @param cause - optional underlying cause of the error.
     * @param meta - optional metadata to be reported.
     */
    public constructor (message: string, cause: Error | any = {}, meta: any = {}) {
        super(message, cause, meta)
    }
}
