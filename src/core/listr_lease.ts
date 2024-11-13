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
import { type ListrTaskWrapper } from 'listr2'
import { type Lease } from './lease.js'
import chalk from 'chalk'
import { LeaseAcquisitionError } from './lease_errors.js'


export class ListrLease {
    public static readonly DEFAULT_LEASE_ACQUIRE_ATTEMPTS = 10

    private constructor () {
        throw new Error('This class cannot be instantiated')
    }

    public static newAcquireLeaseTask (lease: Lease, task: ListrTaskWrapper<any, any, any>) {
        return task.newListr([
            {
                title: 'Acquire lease',
                task: async (_, task) => {
                    await ListrLease.acquireWithRetry(lease, task)
                }
            }
        ], {
            concurrent: false,
            rendererOptions: {
                collapseSubtasks: false
            }
        })
    }

    private static async acquireWithRetry (lease: Lease, task: ListrTaskWrapper<any, any, any>): Promise<void> {
        const maxAttempts = +process.env.SOLO_LEASE_ACQUIRE_ATTEMPTS || ListrLease.DEFAULT_LEASE_ACQUIRE_ATTEMPTS
        const title = task.title

        let attempt: number
        let innerError: Error | null = null
        for (attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                await lease.acquire()
                task.title = `${title} - ${chalk.green('lease acquired successfully')}` +
                    `, attempt: ${chalk.cyan(attempt.toString())}/${chalk.cyan(maxAttempts.toString())}`
                return
            } catch (e: LeaseAcquisitionError | any) {
                task.title = `${title} - ${chalk.gray(`lease exists, attempting again in ${lease.DurationSeconds} seconds`)}` +
                    `, attempt: ${chalk.cyan(attempt.toString())}/${chalk.cyan(maxAttempts.toString())}`

                if (attempt === maxAttempts) {
                    innerError = e
                }
            }
        }

        task.title = `${title} - ${chalk.red('failed to acquire lease, max attempts reached!')}` +
            `, attempt: ${chalk.cyan(attempt.toString())}/${chalk.cyan(maxAttempts.toString())}`

        throw new LeaseAcquisitionError(`Failed to acquire lease, max attempts reached (${attempt}/${maxAttempts})`, innerError)
    }
}
