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
import { describe, expect, it } from '@jest/globals'
import path from 'path'
import { flags } from '../../../src/commands/index.mjs'
import { ConfigManager, ProfileManager, constants } from '../../../src/core/index.mjs'
import { getTmpDir, testLogger } from '../../test_util.js'

const configFile = path.join(getTmpDir(), 'resource-manager.config')
const configManager = new ConfigManager(testLogger, configFile)
const profileManager = new ProfileManager(testLogger, configManager)
configManager.setFlag(flags.nodeIDs, ['node0', 'node1', 'node3'])

describe('ProfileManager', () => {
  it('should throw error for missing profile file', () => {
    expect.assertions(1)
    try {
      configManager.setFlag(flags.profileFile, 'INVALID')
      profileManager.loadProfiles(true)
    } catch (e) {
      expect(e.message.includes('profileFile does not exist')).toBeTruthy()
    }
  })

  it('should be able to load a profile file', () => {
    configManager.setFlag(flags.profileFile, constants.DEFAULT_PROFILE_FILE)
    const profiles = profileManager.loadProfiles(true)
    expect(profiles).not.toBeNull()
    expect(profiles.get(constants.PROFILE_LARGE)).not.toBeNull()
    expect(profiles.get(constants.PROFILE_LARGE).consensus).not.toBeNull()
  })

  describe.each([
    { profileName: 'large' }
    // { profileName: 'medium' },
    // { profileName: 'small' },
    // { profileName: 'tiny' }
  ])('determine chart values for a profile', (input) => {
    it(`should determine FST chart values [profile = ${input.profileName}]`, () => {
      configManager.setFlag(flags.profileFile, constants.DEFAULT_PROFILE_FILE)
      profileManager.loadProfiles(true)
      const valuesArg = profileManager.resourceValuesForFSTChart(constants.PROFILE_LARGE)
      expect(valuesArg).not.toBeNull()
    })

    it(`should determine mirror-node chart values [profile = ${input.profileName}]`, () => {
      configManager.setFlag(flags.profileFile, constants.DEFAULT_PROFILE_FILE)
      profileManager.loadProfiles(true)
      const valuesArg = profileManager.resourceValuesForMirrorNodeChart(constants.PROFILE_LARGE)
      expect(valuesArg).not.toBeNull()
    })

    it(`should determine rpc-relay chart values [profile = ${input.profileName}]`, () => {
      configManager.setFlag(flags.profileFile, constants.DEFAULT_PROFILE_FILE)
      profileManager.loadProfiles(true)
      const valuesArg = profileManager.resourceValuesForRpcRelayChart(constants.PROFILE_LARGE)
      expect(valuesArg).not.toBeNull()
    })
  })
})
