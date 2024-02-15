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
import { describe, expect, it, jest } from '@jest/globals'
import { Helm, logging } from '../../../src/core/index.mjs'
import { ShellRunner } from '../../../src/core/shell_runner.mjs'

describe('Helm', () => {
  const logger = logging.NewLogger('debug')
  const helm = new Helm(logger)
  const shellSpy = jest.spyOn(ShellRunner.prototype, 'run').mockImplementation()

  it('should run helm install', async () => {
    await helm.install('arg')
    expect(shellSpy).toHaveBeenCalledWith('helm install arg', true)
  })

  it('should run helm uninstall', async () => {
    await helm.uninstall('arg')
    expect(shellSpy).toHaveBeenCalledWith('helm uninstall arg')
  })

  it('should run helm upgrade', async () => {
    await helm.upgrade('release', 'chart')
    expect(shellSpy).toHaveBeenCalledWith('helm upgrade release chart')
  })

  it('should run helm list', async () => {
    await helm.list()
    expect(shellSpy).toHaveBeenCalledWith('helm list')
  })

  it('should run helm dependency', async () => {
    await helm.dependency('update', 'chart')
    expect(shellSpy).toHaveBeenCalledWith('helm dependency update chart')
  })

  it('should run helm repo', async () => {
    await helm.repo('add', 'name', 'url')
    expect(shellSpy).toHaveBeenCalledWith('helm repo add name url')
  })

  shellSpy.mockClear()
})
