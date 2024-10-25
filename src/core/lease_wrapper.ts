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
import type { ListrTaskWrapper } from 'listr2'
import type { LeaseManager } from './lease_manager.ts'

export class LeaseWrapper {
  private releaseLease: () => Promise<void>

  constructor (private readonly leaseManager: LeaseManager) {}

  private async acquireTask (task: ListrTaskWrapper<any, any, any>, title: string, attempt: number | null = null) {
    const self = this

    const { releaseLease } = await self.leaseManager.acquireLease(task, title, attempt)
    self.releaseLease = releaseLease
  }

  buildAcquireTask (task: ListrTaskWrapper<any, any, any>) {
    const self = this

    return task.newListr([
      {
        title: 'Acquire lease',
        task: async (_, task) => {
          await self.acquireTask(task, 'Acquire lease')
        }
      }
    ], {
      concurrent: false,
      rendererOptions: {
        collapseSubtasks: false
      }
    })
  }

  async release () {
    if (typeof this.releaseLease === 'function') {
      await this.releaseLease()
    }
  }
}