// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {Deprecations} from '../../../src/core/deprecations.js';
import {type Deprecation} from '../../../src/types/deprecation.js';
import {type FlagDeprecation} from '../../../src/types/flag-deprecation.js';

describe('Deprecations', (): void => {
  describe('computeRemoveBy', (): void => {
    it('advances the minor version by the default window of 6', (): void => {
      expect(Deprecations.computeRemoveBy('0.84.0')).to.equal('0.90.0');
    });

    it('advances the minor version by an explicit window', (): void => {
      expect(Deprecations.computeRemoveBy('0.84.0', 5)).to.equal('0.89.0');
    });

    it('resets the patch version and drops pre-release metadata', (): void => {
      expect(Deprecations.computeRemoveBy('1.2.3-alpha', 1)).to.equal('1.3.0');
    });
  });

  describe('resolveRemoveBy', (): void => {
    it('uses the explicit removeBy when provided', (): void => {
      const deprecation: Deprecation = {since: '0.84.0', removalIssue: 5181, removeBy: '1.0.0'};
      expect(Deprecations.resolveRemoveBy(deprecation)).to.equal('1.0.0');
    });

    it('computes the removeBy from since when not provided', (): void => {
      const deprecation: Deprecation = {since: '0.84.0', removalIssue: 5181};
      expect(Deprecations.resolveRemoveBy(deprecation)).to.equal('0.90.0');
    });
  });

  describe('formatDeprecationMessage', (): void => {
    it('includes the feature, versions, replacement, and tracking issue', (): void => {
      const deprecation: Deprecation = {since: '0.84.0', removalIssue: 5181, replacement: '--consensus-node-version'};
      const message: string = Deprecations.formatDeprecationMessage('--release-tag', deprecation);
      expect(message).to.contain("'--release-tag' is deprecated since v0.84.0 and will be removed in v0.90.0.");
      expect(message).to.contain("Use '--consensus-node-version' instead.");
    });

    it('omits the replacement clause when no replacement is given', (): void => {
      const deprecation: Deprecation = {since: '0.84.0', removalIssue: 5181};
      const message: string = Deprecations.formatDeprecationMessage('--release-tag', deprecation);
      expect(message).to.not.contain('Use ');
    });

    it('names the command a scoped deprecation applies to', (): void => {
      const deprecation: Deprecation = {since: '0.84.0', removalIssue: 5181};
      const message: string = Deprecations.formatDeprecationMessage('--release-tag', deprecation, 'relay node add');
      expect(message).to.contain(
        "'--release-tag' is deprecated for 'relay node add' since v0.84.0 and will be removed in v0.90.0.",
      );
    });
  });

  describe('commandScope', (): void => {
    it('returns undefined for a deprecation that is not scoped to any command', (): void => {
      expect(Deprecations.commandScope({since: '0.84.0', removalIssue: 5181})).to.be.undefined;
    });

    it('returns undefined for an empty command list', (): void => {
      expect(Deprecations.commandScope({since: '0.84.0', removalIssue: 5181, commands: []})).to.be.undefined;
    });

    it('returns the command paths the deprecation is scoped to', (): void => {
      const deprecation: FlagDeprecation = {
        since: '0.84.0',
        removalIssue: 5181,
        commands: ['relay node add', 'relay node upgrade'],
      };
      expect(Deprecations.commandScope(deprecation)).to.deep.equal(['relay node add', 'relay node upgrade']);
    });
  });

  describe('appliesToCommand', (): void => {
    const unscoped: FlagDeprecation = {since: '0.84.0', removalIssue: 5181};
    const scoped: FlagDeprecation = {since: '0.84.0', removalIssue: 5181, commands: ['relay node add']};

    it('applies an unscoped deprecation to every command', (): void => {
      expect(Deprecations.appliesToCommand(unscoped, 'consensus network deploy')).to.be.true;
    });

    it('applies an unscoped deprecation when no command was invoked', (): void => {
      expect(Deprecations.appliesToCommand(unscoped, '')).to.be.true;
    });

    it('applies a scoped deprecation to the command it names', (): void => {
      expect(Deprecations.appliesToCommand(scoped, 'relay node add')).to.be.true;
    });

    it('does not apply a scoped deprecation to a different command', (): void => {
      expect(Deprecations.appliesToCommand(scoped, 'relay node upgrade')).to.be.false;
    });

    it('does not apply a scoped deprecation when no command was invoked', (): void => {
      expect(Deprecations.appliesToCommand(scoped, '')).to.be.false;
    });

    it('applies a deprecation scoped to a command group to operations beneath it', (): void => {
      const group: FlagDeprecation = {since: '0.84.0', removalIssue: 5181, commands: ['relay node']};
      expect(Deprecations.appliesToCommand(group, 'relay node destroy')).to.be.true;
      expect(Deprecations.appliesToCommand(group, 'relay node')).to.be.true;
    });

    it('does not treat a command sharing a name prefix as being in scope', (): void => {
      const group: FlagDeprecation = {since: '0.84.0', removalIssue: 5181, commands: ['relay node']};
      expect(Deprecations.appliesToCommand(group, 'relay nodes list')).to.be.false;
    });

    it('applies when any of several scoped commands matches', (): void => {
      const multiple: FlagDeprecation = {
        since: '0.84.0',
        removalIssue: 5181,
        commands: ['relay node add', 'relay node upgrade'],
      };
      expect(Deprecations.appliesToCommand(multiple, 'relay node upgrade')).to.be.true;
    });
  });

  describe('formatHelpMarker', (): void => {
    it('renders a compact marker with version window, replacement, and issue', (): void => {
      const deprecation: Deprecation = {since: '0.84.0', removalIssue: 5181, replacement: '--consensus-node-version'};
      expect(Deprecations.formatHelpMarker(deprecation)).to.equal(
        'since v0.84.0, removal v0.90.0, use --consensus-node-version',
      );
    });
  });
});
