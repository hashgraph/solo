// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {SemanticVersion} from '../../../../src/business/utils/semantic-version.js';

type UpgradeLeavesTopicMessageFeeEntryMissing = (
  currentVersion: SemanticVersion<string>,
  upgradeVersion: string,
) => boolean;

const upgradeLeavesTopicMessageFeeEntryMissing: UpgradeLeavesTopicMessageFeeEntryMissing = (
  currentVersion: SemanticVersion<string>,
  upgradeVersion: string,
): boolean =>
  (
    NodeCommandTasks as unknown as {upgradeLeavesTopicMessageFeeEntryMissing: UpgradeLeavesTopicMessageFeeEntryMissing}
  ).upgradeLeavesTopicMessageFeeEntryMissing(currentVersion, upgradeVersion);

const warns: (currentVersion: string, upgradeVersion: string) => boolean = (
  currentVersion: string,
  upgradeVersion: string,
): boolean => upgradeLeavesTopicMessageFeeEntryMissing(new SemanticVersion<string>(currentVersion), upgradeVersion);

describe('NodeCommandTasks.upgradeLeavesTopicMessageFeeEntryMissing', (): void => {
  it('warns when upgrading from v0.72.x to v0.73.0 or later', (): void => {
    expect(warns('v0.72.0', 'v0.73.0')).to.be.true;
    expect(warns('v0.72.1', 'v0.75.1')).to.be.true;
  });

  it('does not warn when the target is still below v0.73.0', (): void => {
    expect(warns('v0.72.0', 'v0.72.1')).to.be.false;
  });

  it('does not warn when upgrading from v0.71.x or earlier', (): void => {
    expect(warns('v0.71.3', 'v0.75.1')).to.be.false;
  });

  it('does not warn when upgrading from v0.73.0 or later', (): void => {
    expect(warns('v0.73.0', 'v0.75.1')).to.be.false;
  });
});
