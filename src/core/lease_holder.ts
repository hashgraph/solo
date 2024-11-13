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

import { MissingArgumentError } from './errors.js'
import os from 'node:os'
import process from 'node:process'

export class LeaseHolder {
    private constructor (private readonly username: string, private readonly hostname: string, private readonly processId: number) {
        if (!username) throw new MissingArgumentError('username is required')
        if (!hostname) throw new MissingArgumentError('hostname is required')
        if (!processId) throw new MissingArgumentError('pid is required')
    }

    public static of (username: string): LeaseHolder {
        return new LeaseHolder(username, os.hostname(), process.pid)
    }

    public static default (): LeaseHolder {
        return LeaseHolder.of(os.userInfo().username)
    }

    public get Username (): string {
        return this.username
    }

    public get Hostname (): string {
        return this.hostname
    }

    public get ProcessId (): number {
        return this.processId
    }

    public toObject (): any {
        return {
            username: this.username,
            hostname: this.hostname,
            pid: this.processId
        }
    }

    public equals (other: LeaseHolder): boolean {
        return this.Username === other.Username && this.Hostname === other.Hostname && this.ProcessId === other.ProcessId
    }

    public isSameIdentity (other: LeaseHolder): boolean {
        return this.Username === other.Username && this.Hostname === other.Hostname
    }

    public isProcessAlive (): boolean {
        try {
            return process.kill(this.ProcessId, 0)
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
