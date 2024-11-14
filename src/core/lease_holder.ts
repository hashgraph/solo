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

import { MissingArgumentError } from './errors.ts'
import os from 'node:os'
import process from 'node:process'

export class LeaseHolder {
    private readonly _username: string
    private readonly _hostname: string
    private readonly _processId: number

    private constructor (username: string, hostname: string, processId: number) {
        if (!username) throw new MissingArgumentError('username is required')
        if (!hostname) throw new MissingArgumentError('hostname is required')
        if (!processId) throw new MissingArgumentError('pid is required')

        this._username = username
        this._hostname = hostname
        this._processId = processId
    }

    public static of (username: string): LeaseHolder {
        return new LeaseHolder(username, os.hostname(), process.pid)
    }

    public static default (): LeaseHolder {
        return LeaseHolder.of(os.userInfo().username)
    }

    public get username (): string {
        return this._username
    }

    public get hostname (): string {
        return this._hostname
    }

    public get processId (): number {
        return this._processId
    }

    public toObject (): any {
        return {
            username: this._username,
            hostname: this._hostname,
            pid: this._processId
        }
    }

    public equals (other: LeaseHolder): boolean {
        return this.username === other.username && this.hostname === other.hostname && this.processId === other.processId
    }

    public isSameMachineIdentity (other: LeaseHolder): boolean {
        return this.username === other.username && this.hostname === other.hostname
    }

    public isProcessAlive (): boolean {
        try {
            return process.kill(this.processId, 0)
        } catch (e: any) {
            return e.code === 'EPERM'
        }
    }

    public toJson (): string {
        return JSON.stringify(this.toObject())
    }

    public static fromJson (json: string): LeaseHolder {
        const obj: ReturnType<LeaseHolder['toObject']> = JSON.parse(json)
        return new LeaseHolder(obj.username, obj.hostname, obj.pid)
    }
}
