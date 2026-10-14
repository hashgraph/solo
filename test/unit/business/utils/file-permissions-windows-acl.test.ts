// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {FilePermissions} from '../../../../src/business/utils/file-permissions.js';

/**
 * The Windows DACL parser is security-critical and cannot be exercised on a POSIX CI runner
 * through the filesystem, so it is tested here as a pure function against captured `icacls`
 * output. An earlier revision read only the first parenthesised group, so `(OI)(CI)(M)` was
 * interpreted as `OI` and the Modify grant was missed entirely.
 */
describe('FilePermissions Windows ACL parsing', (): void => {
  const targetPath: string = String.raw`C:\Users\me\.solo\solo-config.yaml`;
  const currentPrincipal: string = String.raw`DESKTOP-X\me`;

  function parse(output: string): string | undefined {
    return FilePermissions.findUntrustedAceInIcaclsOutput(targetPath, output, currentPrincipal);
  }

  it('accepts a DACL granting full control only to the user, SYSTEM and Administrators', (): void => {
    const output: string = [
      String.raw`C:\Users\me\.solo\solo-config.yaml NT AUTHORITY\SYSTEM:(I)(F)`,
      String.raw`                                   BUILTIN\Administrators:(I)(F)`,
      String.raw`                                   DESKTOP-X\me:(I)(F)`,
      '',
      'Successfully processed 1 files; Failed processing 0 files',
    ].join('\n');

    expect(parse(output)).to.be.undefined;
  });

  it('rejects an inherited Modify grant expressed as multiple groups', (): void => {
    // The regression case: (OI)(CI)(M) must be read as granting M, not as OI.
    const output: string = [
      String.raw`C:\Users\me\.solo\solo-config.yaml NT AUTHORITY\SYSTEM:(I)(F)`,
      String.raw`                                   BUILTIN\Users:(OI)(CI)(M)`,
      String.raw`                                   DESKTOP-X\me:(I)(F)`,
    ].join('\n');

    expect(parse(output)).to.match(/grants 'M' to 'BUILTIN\\Users'/);
  });

  it('rejects a plain write grant to another user', (): void => {
    const output: string = [
      String.raw`C:\Users\me\.solo\solo-config.yaml DESKTOP-X\me:(F)`,
      String.raw`                                   DESKTOP-X\attacker:(W)`,
    ].join('\n');

    expect(parse(output)).to.match(/grants 'W' to 'DESKTOP-X\\attacker'/);
  });

  it('ignores inherit-only entries, which do not apply to the path itself', (): void => {
    // C:\ carries such an ACE granting Modify to Authenticated Users by default; honouring it
    // would reject every ordinary Windows installation.
    const output: string = [
      String.raw`C:\ ` + String.raw`NT AUTHORITY\Authenticated Users:(OI)(CI)(IO)(M)`,
      String.raw`    BUILTIN\Administrators:(OI)(CI)(F)`,
    ].join('\n');

    expect(FilePermissions.findUntrustedAceInIcaclsOutput(String.raw`C:\ `.trimEnd(), output, currentPrincipal)).to.be
      .undefined;
  });

  it('matches principals that contain spaces', (): void => {
    // 'NT AUTHORITY\SYSTEM' and 'CREATOR OWNER' must resolve as whole principals; an earlier
    // parser truncated at whitespace and never matched the trusted list.
    const output: string = [
      String.raw`C:\Users\me\.solo\solo-config.yaml NT AUTHORITY\SYSTEM:(F)`,
      '                                   CREATOR OWNER:(F)',
      String.raw`                                   DESKTOP-X\me:(F)`,
    ].join('\n');

    expect(parse(output)).to.be.undefined;
  });

  it('treats generic write and generic all as write grants', (): void => {
    const output: string = String.raw`C:\Users\me\.solo\solo-config.yaml DESKTOP-X\other:(GW)`;

    expect(parse(output)).to.match(/grants 'GW'/);
  });

  it('rejects rights that let a principal grant itself write access', (): void => {
    // WDAC rewrites the DACL and WO takes ownership; an owner implicitly holds DACL-write. Either
    // is a complete bypass of every other right in the list, so both must count as write.
    for (const escalationRight of ['WDAC', 'WO']) {
      const output: string = [
        String.raw`C:\Users\me\.solo\solo-config.yaml DESKTOP-X\me:(F)`,
        String.raw`                                   DESKTOP-X\attacker:(${escalationRight})`,
      ].join('\n');

      expect(parse(output), `right ${escalationRight}`).to.match(
        new RegExp(String.raw`grants '${escalationRight}' to 'DESKTOP-X\\attacker'`),
      );
    }
  });

  it('rejects delete rights, which allow replacing the file', (): void => {
    for (const deleteRight of ['D', 'DE']) {
      const output: string = [
        String.raw`C:\Users\me\.solo\solo-config.yaml DESKTOP-X\me:(F)`,
        String.raw`                                   DESKTOP-X\attacker:(${deleteRight})`,
      ].join('\n');

      expect(parse(output), `right ${deleteRight}`).to.match(new RegExp(`grants '${deleteRight}'`));
    }
  });

  it('does not read an explicit deny ACE as a grant', (): void => {
    // A hardened installation that explicitly denies write is doing the right thing; treating
    // (DENY)(W) as a write grant would reject exactly that configuration.
    const output: string = [
      String.raw`C:\Users\me\.solo\solo-config.yaml DESKTOP-X\me:(F)`,
      String.raw`                                   BUILTIN\Users:(DENY)(W)`,
    ].join('\n');

    expect(parse(output)).to.be.undefined;
  });

  it('still rejects a separate allow entry for a principal that also has a deny entry', (): void => {
    // icacls prints one ACE per line, so skipping deny lines must not hide a grant elsewhere.
    const output: string = [
      String.raw`C:\Users\me\.solo\solo-config.yaml DESKTOP-X\me:(F)`,
      String.raw`                                   DESKTOP-X\attacker:(DENY)(RX)`,
      String.raw`                                   DESKTOP-X\attacker:(M)`,
    ].join('\n');

    expect(parse(output)).to.match(/grants 'M' to 'DESKTOP-X\\attacker'/);
  });

  it('accepts a read-only grant to another principal', (): void => {
    const output: string = [
      String.raw`C:\Users\me\.solo\solo-config.yaml DESKTOP-X\me:(F)`,
      String.raw`                                   BUILTIN\Users:(RX)`,
    ].join('\n');

    expect(parse(output)).to.be.undefined;
  });

  it('is case-insensitive about the current user principal', (): void => {
    const output: string = String.raw`C:\Users\me\.solo\solo-config.yaml desktop-x\ME:(F)`;

    expect(parse(output)).to.be.undefined;
  });
});
