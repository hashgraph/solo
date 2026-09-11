// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import {container} from 'tsyringe-neo';
import * as constants from './constants.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {SubprocessEnvironment} from './subprocess-environment.js';
import {SubprocessCommandProfile} from './subprocess-command-profile.js';
import {type SoloConfigSchema} from '../data/schema/model/solo/solo-config-schema.js';
import {SoloConfigSchemaDefinition} from '../data/schema/migration/impl/solo/solo-config-schema-definition.js';
import {type ClassToObjectMapper} from '../data/mapper/impl/class-to-object-mapper.js';
import {type AdditionalEnvironmentVariablesSchema} from '../data/schema/model/solo/additional-environment-variables-schema.js';
import yaml from 'yaml';
import {type SoloLogger} from './logging/solo-logger.js';
import {OperatingSystem} from '../business/utils/operating-system.js';
import {PathEx} from '../business/utils/path-ex.js';
import {FilePermissions} from '../business/utils/file-permissions.js';
import {SoloErrors} from './errors/solo-errors.js';

/**
 * Loads the operator's Solo config file and applies its
 * `subprocess.additionalEnvironmentVariables` setting to {@link SubprocessEnvironment}.
 *
 * This is a separate startup step rather than part of the `ConfigProvider` factory for two
 * reasons. Config sources load asynchronously, so a value read inside the synchronous factory
 * resolves to the schema default and the setting silently does nothing. And the merged config
 * cannot simply be refreshed there: `LayeredConfig.refresh()` refreshes *every* source, which
 * would newly activate bundled resource files that currently never load, changing unrelated
 * behaviour as a side effect of this feature.
 *
 * The setting is read from the config file source alone, which is exactly its documented
 * contract: `subprocess.*` is config-file only and deliberately cannot be supplied by the
 * environment.
 */
export class SubprocessEnvironmentBootstrap {
  /**
   * Reads `<homeDirectory>/solo-config.yaml` and configures the per-command operator allowlist.
   *
   * The file is optional. When it is absent nothing happens; when it is present but untrusted or
   * unreadable this throws, because the alternative is an operator believing their passthrough
   * settings took effect when they silently did not.
   *
   * @param logger - used to report refused entries; refusal must never be silent
   * @param homeDirectory - directory holding the Solo config file; parameterised for testing
   */
  public static async configureFromUserConfig(
    logger: SoloLogger,
    homeDirectory: string = constants.SOLO_HOME_DIR,
  ): Promise<void> {
    // Installed before anything else so every spawn in the run is covered, including the direct
    // kubectl spawns in K8ClientContainer and port forwarding that a per-call callback missed.
    SubprocessEnvironment.configureWithheldReporter(
      (profile: SubprocessCommandProfile, withheldNames: string[]): void => {
        // Logged at info, not debug, so the answer to "was my environment variable filtered out?"
        // is in solo.log by default rather than only under --debug. Names only, never values.
        logger.info(
          `Withheld ${withheldNames.length} environment variable(s) from '${profile}' commands ` +
            'because they are not on the allowlist for that command:',
        );
        for (const line of SubprocessEnvironment.renderWithheldNames(withheldNames)) {
          logger.info(`  withheld from '${profile}': ${line}`);
        }
      },
    );

    const configFilePath: string = PathEx.join(homeDirectory, constants.DEFAULT_SOLO_CONFIG_FILE);
    if (!fs.existsSync(configFilePath)) {
      // No config file is the common case; there is simply nothing to add to the allowlist.
      return;
    }

    // The file selects which additional parent variables reach helm and kubectl, so anyone able to
    // write it - or a directory on the way to it - can widen what those commands receive. Solo's
    // umask never applied to a file the user created, and a custom SOLO_HOME may sit somewhere far
    // less protected than a home directory, so the directories are checked too. See
    // findUntrustedAncestorReason for how far that walk goes on each platform.
    const ancestorReason: string | undefined = FilePermissions.findUntrustedAncestorReason(homeDirectory);
    if (ancestorReason) {
      throw new SoloErrors.validation.subprocessConfigUnsafePermissions(configFilePath, ancestorReason);
    }

    // Validate the descriptor rather than the path: O_NOFOLLOW plus fstat on the descriptor we go on
    // to read means the bytes parsed below are the bytes that were checked, for the final component.
    //
    // Scope of that guarantee, stated precisely because it is easy to overstate: it covers the file
    // itself. It does NOT make the directory walk above race-free — an attacker who can already
    // write to one of those directories could swap a component between the check and the open.
    // Closing that would need component-by-component opens (openat/O_DIRECTORY, or handle-based
    // traversal on Windows), which Node's fs API does not expose. The directory checks therefore
    // defend against a static misconfiguration, such as a group-writable SOLO_HOME, rather than
    // against an active attacker who already holds write access somewhere on the path.
    const contents: string = SubprocessEnvironmentBootstrap.readTrustedFile(configFilePath);

    const objectMapper: ClassToObjectMapper = container.resolve<ClassToObjectMapper>(InjectTokens.ObjectMapper);
    let configuration: SoloConfigSchema;
    try {
      configuration = await new SoloConfigSchemaDefinition(objectMapper).transform(yaml.parse(contents) ?? {});
    } catch (error) {
      // Deliberately not swallowed: a present-but-unusable file (malformed YAML, failed migration)
      // must be reported. Absence was already handled above.
      throw new SoloErrors.validation.subprocessConfigLoadFailed(
        configFilePath,
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    const additional: AdditionalEnvironmentVariablesSchema | undefined =
      configuration?.subprocess?.additionalEnvironmentVariables;
    if (!additional) {
      return;
    }

    SubprocessEnvironmentBootstrap.assertValidShape(configFilePath, additional);

    SubprocessEnvironment.configureOperatorAllowlist(
      {
        [SubprocessCommandProfile.GENERIC]: additional.generic,
        [SubprocessCommandProfile.KUBECTL]: additional.kubectl,
        [SubprocessCommandProfile.HELM]: additional.helm,
        [SubprocessCommandProfile.KIND]: additional.kind,
        [SubprocessCommandProfile.CONTAINER_ENGINE]: additional.containerEngine,
        [SubprocessCommandProfile.BREW]: additional.brew,
        [SubprocessCommandProfile.NPM]: additional.npm,
        [SubprocessCommandProfile.GITHUB_CLI]: additional.githubCli,
      },
      (refusedEntries: string[]): void => {
        logger.warn(
          `Refusing to forward ${refusedEntries.join(', ')} to external commands despite ` +
            'subprocess.additionalEnvironmentVariables: these can change how a spawned tool ' +
            'loads code, whom it trusts, or where it fetches credentials.',
        );
      },
    );
  }

  /**
   * Opens {@link filePath} without following symlinks, verifies the *descriptor* is a regular file
   * the current user owns and no one else can write, and returns its contents.
   *
   * @param filePath - the config file to read
   * @returns the file contents
   * @throws SubprocessConfigUnsafePermissionsSoloError when the opened file cannot be trusted
   * @throws SubprocessConfigLoadFailedSoloError when it cannot be opened or read
   */
  private static readTrustedFile(filePath: string): string {
    // O_NOFOLLOW is a POSIX flag; Windows has no equivalent, and the symlink case is covered by the
    // lstat check inside findUntrustedOwnershipReason below.
    const openFlags: number = OperatingSystem.isWin32()
      ? fs.constants.O_RDONLY
      : fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;

    let fileDescriptor: number;
    try {
      fileDescriptor = fs.openSync(filePath, openFlags);
    } catch (error) {
      // O_NOFOLLOW reports ELOOP when the entry is a symlink. That is a trust failure rather than
      // an I/O failure, and saying so is far more useful than "failed to read".
      if ((error as NodeJS.ErrnoException)?.code === 'ELOOP') {
        throw new SoloErrors.validation.subprocessConfigUnsafePermissions(
          filePath,
          'it is a symbolic link, whose target could be replaced by another user',
        );
      }
      throw new SoloErrors.validation.subprocessConfigLoadFailed(
        filePath,
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    try {
      const stats: fs.Stats = fs.fstatSync(fileDescriptor);
      if (!stats.isFile()) {
        throw new SoloErrors.validation.subprocessConfigUnsafePermissions(filePath, 'it is not a regular file');
      }
      // On Windows O_NOFOLLOW does not exist, so the open above would have followed a reparse
      // point; check explicitly. This is a check-then-use on the name, which is why the Windows
      // guarantee is documented as weaker than the POSIX one.
      if (OperatingSystem.isWin32() && fs.lstatSync(filePath).isSymbolicLink()) {
        throw new SoloErrors.validation.subprocessConfigUnsafePermissions(
          filePath,
          'it is a symbolic link, whose target could be replaced by another user',
        );
      }
      const reason: string | undefined = FilePermissions.findUntrustedDescriptorReason(filePath, stats);
      if (reason) {
        throw new SoloErrors.validation.subprocessConfigUnsafePermissions(filePath, reason);
      }
      return fs.readFileSync(fileDescriptor, 'utf8');
    } finally {
      fs.closeSync(fileDescriptor);
    }
  }

  /**
   * Rejects a config value whose shape TypeScript cannot enforce at runtime.
   *
   * `additionalEnvironmentVariables.helm: MY_VAR` is valid YAML and type-checks nowhere: the
   * string would be iterated character by character, quietly allowlisting `M`, `Y`, `_`… A mapping
   * or number would instead throw a raw `TypeError` from outside the registered-error path. Both
   * are operator mistakes and both deserve a named error naming the offending key.
   *
   * @param configFilePath - used only for the error message
   * @param additional - the parsed `additionalEnvironmentVariables` value
   * @throws SubprocessConfigInvalidValueSoloError when a command's value is not a list of strings
   */
  private static assertValidShape(configFilePath: string, additional: AdditionalEnvironmentVariablesSchema): void {
    for (const [commandKey, value] of Object.entries(additional)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (!Array.isArray(value)) {
        throw new SoloErrors.validation.subprocessConfigInvalidValue(
          configFilePath,
          `subprocess.additionalEnvironmentVariables.${commandKey} must be a list of variable names`,
        );
      }
      for (const entry of value) {
        if (typeof entry !== 'string') {
          throw new SoloErrors.validation.subprocessConfigInvalidValue(
            configFilePath,
            `subprocess.additionalEnvironmentVariables.${commandKey} must contain only variable names, ` +
              `but one entry is of type ${typeof entry}`,
          );
        }
      }
    }
  }
}
