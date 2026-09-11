// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import os from 'node:os';
import {
  confirm as confirmPrompt,
  input as inputPrompt,
  number as numberPrompt,
  select as selectPrompt,
} from '@inquirer/prompts';
import {Flags} from '../../../src/commands/flags.js';
import {FlagValidation} from '../../../src/commands/validation/flag-validation.js';
import {FlagInputFailedSoloError} from '../../../src/core/errors/classes/validation/flag-input-failed-solo-error.js';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';
import {type AnyListrContext} from '../../../src/types/aliases.js';
import {type ClusterReferenceName, type SoloListrTaskWrapper} from '../../../src/types/index.js';

interface RecordedPromptCall {
  component: unknown;
  options: {default?: unknown; message?: string; choices?: unknown; validate?: (value: unknown) => boolean | string};
}

/** Stands in for the Listr2 task wrapper so prompt functions can be exercised without a real terminal. */
class FakePromptTaskWrapper {
  public readonly recordedCalls: RecordedPromptCall[] = [];
  private readonly answers: unknown[];
  private readonly failure?: Error;

  public constructor(answers: unknown[] = [], failure?: Error) {
    this.answers = [...answers];
    this.failure = failure;
  }

  public prompt(): {
    run: (component: unknown, options: RecordedPromptCall['options']) => Promise<unknown>;
  } {
    return {
      run: async (component: unknown, options: RecordedPromptCall['options']): Promise<unknown> => {
        this.recordedCalls.push({component, options});
        if (this.failure) {
          throw this.failure;
        }
        if (this.answers.length === 0) {
          throw new Error('FakePromptTaskWrapper has no scripted answer left');
        }

        // Inquirer re-asks in place while `validate` rejects, so an unacceptable answer never reaches the caller.
        const answer: unknown = this.answers.shift();
        return options.validate?.(answer) === true || options.validate === undefined
          ? answer
          : this.prompt().run(component, options);
      },
    };
  }

  public asTask(): SoloListrTaskWrapper<AnyListrContext> {
    return this as unknown as SoloListrTaskWrapper<AnyListrContext>;
  }
}

// typed stand-in for a flag value the user did not provide; a literal undefined argument is banned by lint
const missingInput: undefined = undefined;

/** Flags whose prompts use the shared text-input flow; expectations are read from each flag's definition. */
const textPromptFlags: CommandFlag[] = [
  Flags.clusterRef,
  Flags.clusterSetupNamespace,
  Flags.namespace,
  Flags.consensusNodeVersion,
  Flags.relayReleaseTag,
  Flags.cacheDir,
  Flags.nodeAliasesUnparsed,
  Flags.chainId,
  Flags.operatorId,
  Flags.operatorKey,
  Flags.privateKey,
  Flags.ed25519PrivateKey,
  Flags.ecdsaPrivateKey,
  Flags.explorerTlsHostName,
  Flags.soloChartVersion,
  Flags.blockNodeChartVersion,
  Flags.localBuildPath,
  Flags.accountId,
  Flags.fileId,
  Flags.filePath,
  Flags.nodeAlias,
  Flags.skipNodeAlias,
  Flags.gossipEndpoints,
  Flags.grpcEndpoints,
  Flags.endpointType,
  Flags.debugNodeAlias,
  Flags.mirrorNodeVersion,
  Flags.explorerVersion,
  Flags.deployment,
  Flags.deploymentClusters,
  Flags.grpcTlsCertificatePath,
  Flags.grpcWebTlsCertificatePath,
  Flags.externalDatabaseHost,
  Flags.externalDatabaseOwnerUsername,
  Flags.externalDatabaseOwnerPassword,
  Flags.externalDatabaseReadonlyUsername,
  Flags.externalDatabaseReadonlyPassword,
  Flags.grpcTlsKeyPath,
  Flags.grpcWebTlsKeyPath,
];

// outputDir and inputDir are string flags but their prompts use the toggle (confirm) flow
const togglePromptFlags: CommandFlag[] = [
  Flags.forcePortForward,
  Flags.deployPrometheusStack,
  Flags.deployMinio,
  Flags.deployCertManager,
  Flags.deployCertManagerCrds,
  Flags.force,
  Flags.generateGossipKeys,
  Flags.generateTlsKeys,
  Flags.enableExplorerTls,
  Flags.deletePvcs,
  Flags.deleteSecrets,
  Flags.updateAccountKeys,
  Flags.persistentVolumeClaims,
  Flags.outputDir,
  Flags.inputDir,
  Flags.loadBalancerEnabled,
];

const numberPromptFlags: CommandFlag[] = [
  Flags.replicaCount,
  Flags.id,
  Flags.mirrorNodeId,
  Flags.amount,
  Flags.createAmount,
];

/** Flags whose prompts have bespoke behavior and are covered by dedicated test suites below. */
const customPromptFlags: CommandFlag[] = [
  Flags.numberOfConsensusNodes,
  Flags.valuesFile,
  Flags.networkDeploymentValuesFile,
  Flags.chartDirectory,
  Flags.tlsClusterIssuerType,
  Flags.username,
  Flags.context,
];

function expectedPromptDefault(flag: CommandFlag): unknown {
  return flag.definition.promptDefaultValue ?? flag.definition.defaultValue;
}

/**
 * Answers tried in order, covering the rule sets flags declare today: an arbitrary string for flags without rules,
 * a node alias, and a whole number. Extend this list when a flag adopts rules none of these satisfy.
 */
const candidateAnswers: string[] = ['answered-value', 'node1', '1'];

/**
 * An answer that satisfies the flag's own rules, so that `FakePromptTaskWrapper` accepts it on the first ask.
 * Throws rather than returning an answer the flag would reject, which would re-ask forever with no answer left.
 */
function acceptableAnswer(flag: CommandFlag): string {
  const answer: string | undefined = candidateAnswers.find(
    (candidate: string): boolean => FlagValidation.violationOf(flag, candidate) === undefined,
  );

  if (answer === undefined) {
    throw new Error(`No candidate answer satisfies the rules of --${flag.name}; add one to candidateAnswers`);
  }

  return answer;
}

function simulateInteractiveTerminal(): void {
  process.stdout.isTTY = true;
  process.stdin.isTTY = true;
}

function simulateNonInteractiveTerminal(): void {
  process.stdout.isTTY = false;
  process.stdin.isTTY = false;
}

describe('Flag prompts', (): void => {
  let originalStdoutIsTty: boolean | undefined;
  let originalStdinIsTty: boolean | undefined;

  beforeEach((): void => {
    originalStdoutIsTty = process.stdout.isTTY;
    originalStdinIsTty = process.stdin.isTTY;
  });

  afterEach((): void => {
    process.stdout.isTTY = originalStdoutIsTty as boolean;
    process.stdin.isTTY = originalStdinIsTty as boolean;
  });

  describe('prompt metadata', (): void => {
    it('declares prompt text on the definition of every definition-driven flag', (): void => {
      const missingPromptText: string[] = [...textPromptFlags, ...togglePromptFlags, ...numberPromptFlags]
        .filter((flag: CommandFlag): boolean => !flag.definition.promptText)
        .map((flag: CommandFlag): string => flag.constName);

      expect(missingPromptText).to.deep.equal([]);
    });
  });

  describe('text prompts', (): void => {
    for (const flag of textPromptFlags) {
      describe(`--${flag.name} (${flag.constName})`, (): void => {
        it('returns the provided value without prompting', async (): Promise<void> => {
          const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

          const result: unknown = await flag.prompt(fakeTask.asTask(), 'provided-value');

          expect(result).to.equal('provided-value');
          expect(fakeTask.recordedCalls).to.have.lengthOf(0);
        });

        it('prompts with the definition prompt text and default when no value is provided', async (): Promise<void> => {
          simulateInteractiveTerminal();
          const answer: string = acceptableAnswer(flag);
          const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper([answer]);

          const result: unknown = await flag.prompt(fakeTask.asTask(), missingInput);

          expect(result).to.equal(answer);
          expect(fakeTask.recordedCalls).to.have.lengthOf(1);
          expect(fakeTask.recordedCalls[0].component).to.equal(inputPrompt);
          expect(fakeTask.recordedCalls[0].options.message).to.equal(flag.definition.promptText);
          expect(fakeTask.recordedCalls[0].options.default).to.equal(expectedPromptDefault(flag));
        });

        it('fails without prompting when no value is provided and no TTY is attached', async (): Promise<void> => {
          simulateNonInteractiveTerminal();
          const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

          await expect(flag.prompt(fakeTask.asTask(), missingInput)).to.be.rejectedWith(
            FlagInputFailedSoloError,
            'Cannot prompt for input in non-interactive mode',
          );
          expect(fakeTask.recordedCalls).to.have.lengthOf(0);
        });

        if (flag.definition.emptyCheckMessage) {
          it('rejects an empty prompt answer', async (): Promise<void> => {
            simulateInteractiveTerminal();
            const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper(['']);

            await expect(flag.prompt(fakeTask.asTask(), missingInput)).to.be.rejectedWith(
              FlagInputFailedSoloError,
              flag.definition.emptyCheckMessage,
            );
          });
        }
      });
    }
  });

  describe('toggle prompts', (): void => {
    for (const flag of togglePromptFlags) {
      describe(`--${flag.name} (${flag.constName})`, (): void => {
        it('returns a provided true value without prompting', async (): Promise<void> => {
          const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

          const result: unknown = await flag.prompt(fakeTask.asTask(), true);

          expect(result).to.equal(true);
          expect(fakeTask.recordedCalls).to.have.lengthOf(0);
        });

        it('returns a provided false value without prompting', async (): Promise<void> => {
          const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

          const result: unknown = await flag.prompt(fakeTask.asTask(), false);

          expect(result).to.equal(false);
          expect(fakeTask.recordedCalls).to.have.lengthOf(0);
        });

        it('prompts with the definition prompt text and default when no value is provided', async (): Promise<void> => {
          simulateInteractiveTerminal();
          const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper([true]);

          const result: unknown = await flag.prompt(fakeTask.asTask(), missingInput);

          expect(result).to.equal(true);
          expect(fakeTask.recordedCalls).to.have.lengthOf(1);
          expect(fakeTask.recordedCalls[0].component).to.equal(confirmPrompt);
          expect(fakeTask.recordedCalls[0].options.message).to.equal(flag.definition.promptText);
          expect(fakeTask.recordedCalls[0].options.default).to.equal(expectedPromptDefault(flag));
        });

        it('fails without prompting when no value is provided and no TTY is attached', async (): Promise<void> => {
          simulateNonInteractiveTerminal();
          const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

          await expect(flag.prompt(fakeTask.asTask(), missingInput)).to.be.rejectedWith(
            FlagInputFailedSoloError,
            'Cannot prompt for input in non-interactive mode',
          );
          expect(fakeTask.recordedCalls).to.have.lengthOf(0);
        });
      });
    }
  });

  describe('number prompts', (): void => {
    for (const flag of numberPromptFlags) {
      describe(`--${flag.name} (${flag.constName})`, (): void => {
        it('returns the provided number without prompting', async (): Promise<void> => {
          const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

          const result: unknown = await flag.prompt(fakeTask.asTask(), 42);

          expect(result).to.equal(42);
          expect(fakeTask.recordedCalls).to.have.lengthOf(0);
        });

        it('prompts with the definition prompt text and default when no value is provided', async (): Promise<void> => {
          simulateInteractiveTerminal();
          const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper([7]);

          const result: unknown = await flag.prompt(fakeTask.asTask(), missingInput);

          expect(result).to.equal(7);
          expect(fakeTask.recordedCalls).to.have.lengthOf(1);
          expect(fakeTask.recordedCalls[0].component).to.equal(numberPrompt);
          expect(fakeTask.recordedCalls[0].options.message).to.equal(flag.definition.promptText);
          expect(fakeTask.recordedCalls[0].options.default).to.equal(expectedPromptDefault(flag));
        });

        it('fails without prompting when no value is provided and no TTY is attached', async (): Promise<void> => {
          simulateNonInteractiveTerminal();
          const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

          await expect(flag.prompt(fakeTask.asTask(), missingInput)).to.be.rejectedWith(
            FlagInputFailedSoloError,
            'Cannot prompt for input in non-interactive mode',
          );
          expect(fakeTask.recordedCalls).to.have.lengthOf(0);
        });
      });
    }

    it('returns a provided zero without prompting', async (): Promise<void> => {
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

      const result: unknown = await Flags.replicaCount.prompt(fakeTask.asTask(), 0);

      expect(result).to.equal(0);
      expect(fakeTask.recordedCalls).to.have.lengthOf(0);
    });

    it('prompts when the provided value is a numeric string instead of a number', async (): Promise<void> => {
      simulateInteractiveTerminal();
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper([5]);

      const result: unknown = await Flags.replicaCount.prompt(fakeTask.asTask(), '5');

      expect(result).to.equal(5);
      expect(fakeTask.recordedCalls).to.have.lengthOf(1);
    });
  });

  describe(`--${Flags.numberOfConsensusNodes.name} (${Flags.numberOfConsensusNodes.constName})`, (): void => {
    it('returns the provided number without prompting', async (): Promise<void> => {
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

      const result: unknown = await Flags.numberOfConsensusNodes.prompt(fakeTask.asTask(), 3);

      expect(result).to.equal(3);
      expect(fakeTask.recordedCalls).to.have.lengthOf(0);
    });

    it('re-prompts until a truthy number is entered', async (): Promise<void> => {
      simulateInteractiveTerminal();
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper([undefined, 3]);

      const result: unknown = await Flags.numberOfConsensusNodes.prompt(fakeTask.asTask(), missingInput);

      expect(result).to.equal(3);
      expect(fakeTask.recordedCalls).to.have.lengthOf(2);
      expect(fakeTask.recordedCalls[0].options.message).to.equal(Flags.numberOfConsensusNodes.definition.promptText);
    });

    it('fails without prompting when no value is provided and no TTY is attached', async (): Promise<void> => {
      simulateNonInteractiveTerminal();
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

      await expect(Flags.numberOfConsensusNodes.prompt(fakeTask.asTask(), missingInput)).to.be.rejectedWith(
        FlagInputFailedSoloError,
        'Cannot prompt for input in non-interactive mode',
      );
    });
  });

  describe('values file prompts', (): void => {
    describe(`--${Flags.valuesFile.name} (plain)`, (): void => {
      it('returns the provided value unchanged and never prompts', async (): Promise<void> => {
        const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

        const result: unknown = await Flags.valuesFile.prompt(fakeTask.asTask(), 'values.yaml,other-values.yaml');

        expect(result).to.equal('values.yaml,other-values.yaml');
        expect(fakeTask.recordedCalls).to.have.lengthOf(0);
      });

      it('returns an empty value unchanged and never prompts', async (): Promise<void> => {
        const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

        const result: unknown = await Flags.valuesFile.prompt(fakeTask.asTask(), '');

        expect(result).to.equal('');
        expect(fakeTask.recordedCalls).to.have.lengthOf(0);
      });
    });

    describe(`--${Flags.networkDeploymentValuesFile.name} (network deployment)`, (): void => {
      it('accepts a comma separated multi-cluster value and returns it unchanged', async (): Promise<void> => {
        const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();
        const input: string = 'values.yaml,cluster-1=./a/b/values1.yaml,cluster-2=./a/b/values2.yaml';

        const result: unknown = await Flags.networkDeploymentValuesFile.prompt(fakeTask.asTask(), input);

        expect(result).to.equal(input);
        expect(fakeTask.recordedCalls).to.have.lengthOf(0);
      });

      it('returns an empty value unchanged and never prompts', async (): Promise<void> => {
        const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

        const result: unknown = await Flags.networkDeploymentValuesFile.prompt(fakeTask.asTask(), '');

        expect(result).to.equal('');
        expect(fakeTask.recordedCalls).to.have.lengthOf(0);
      });
    });

    describe('parseValuesFilesInput', (): void => {
      it('maps a plain path to the common key', (): void => {
        const parsed: Record<ClusterReferenceName, Array<string>> = Flags.parseValuesFilesInput('values.yaml');

        expect(parsed).to.deep.equal({[Flags.KEY_COMMON]: [PathEx.resolve('values.yaml')]});
      });

      it('groups cluster-prefixed paths by cluster reference', (): void => {
        const parsed: Record<ClusterReferenceName, Array<string>> = Flags.parseValuesFilesInput(
          'common.yaml,cluster-1=./a/values1.yaml,cluster-1=./a/values2.yaml,cluster-2=./b/values.yaml',
        );

        expect(parsed).to.deep.equal({
          [Flags.KEY_COMMON]: [PathEx.resolve('common.yaml')],
          'cluster-1': [PathEx.resolve('./a/values1.yaml'), PathEx.resolve('./a/values2.yaml')],
          'cluster-2': [PathEx.resolve('./b/values.yaml')],
        });
      });

      it('returns an empty record for empty input', (): void => {
        expect(Flags.parseValuesFilesInput('')).to.deep.equal({});
      });
    });
  });

  describe(`--${Flags.chartDirectory.name} (${Flags.chartDirectory.constName})`, (): void => {
    const missingDirectory: string = PathEx.join(os.tmpdir(), 'solo-flag-prompts-test-missing-directory');

    it('returns an empty string when the literal "false" is provided', async (): Promise<void> => {
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

      const result: unknown = await Flags.chartDirectory.prompt(fakeTask.asTask(), 'false');

      expect(result).to.equal('');
      expect(fakeTask.recordedCalls).to.have.lengthOf(0);
    });

    it('returns an empty value without prompting', async (): Promise<void> => {
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

      const result: unknown = await Flags.chartDirectory.prompt(fakeTask.asTask(), '');

      expect(result).to.equal('');
      expect(fakeTask.recordedCalls).to.have.lengthOf(0);
    });

    it('returns an existing directory without prompting', async (): Promise<void> => {
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

      const result: unknown = await Flags.chartDirectory.prompt(fakeTask.asTask(), os.tmpdir());

      expect(result).to.equal(os.tmpdir());
      expect(fakeTask.recordedCalls).to.have.lengthOf(0);
    });

    it('prompts for a replacement when the provided directory does not exist', async (): Promise<void> => {
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper([os.tmpdir()]);

      const result: unknown = await Flags.chartDirectory.prompt(fakeTask.asTask(), missingDirectory);

      expect(result).to.equal(os.tmpdir());
      expect(fakeTask.recordedCalls).to.have.lengthOf(1);
      expect(fakeTask.recordedCalls[0].options.message).to.equal('Enter local charts directory path: ');
      expect(fakeTask.recordedCalls[0].options.default).to.equal('');
    });

    it('rejects when the prompted replacement directory does not exist either', async (): Promise<void> => {
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper([missingDirectory]);

      await expect(Flags.chartDirectory.prompt(fakeTask.asTask(), missingDirectory)).to.be.rejectedWith(
        FlagInputFailedSoloError,
        'Invalid chart directory',
      );
    });
  });

  describe(`--${Flags.tlsClusterIssuerType.name} (${Flags.tlsClusterIssuerType.constName})`, (): void => {
    // current behavior: a provided value short-circuits to undefined instead of being returned
    it('returns undefined without prompting when a value is provided', async (): Promise<void> => {
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

      const result: unknown = await Flags.tlsClusterIssuerType.prompt(fakeTask.asTask(), 'acme-prod');

      expect(result).to.equal(undefined);
      expect(fakeTask.recordedCalls).to.have.lengthOf(0);
    });

    it('offers the issuer types as select choices when no value is provided', async (): Promise<void> => {
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper(['acme-staging']);

      const result: unknown = await Flags.tlsClusterIssuerType.prompt(fakeTask.asTask(), '');

      expect(result).to.equal('acme-staging');
      expect(fakeTask.recordedCalls).to.have.lengthOf(1);
      expect(fakeTask.recordedCalls[0].component).to.equal(selectPrompt);
      expect(fakeTask.recordedCalls[0].options.message).to.equal(
        'Enter TLS cluster issuer type, available options are: "acme-staging", "acme-prod", or "self-signed":',
      );
      expect(fakeTask.recordedCalls[0].options.default).to.equal('self-signed');
      expect(fakeTask.recordedCalls[0].options.choices).to.deep.equal(['acme-staging', 'acme-prod', 'self-signed']);
    });

    it('wraps prompt failures in a flag input error', async (): Promise<void> => {
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper([], new Error('prompt aborted'));

      await expect(Flags.tlsClusterIssuerType.prompt(fakeTask.asTask(), '')).to.be.rejectedWith(
        FlagInputFailedSoloError,
        'prompt aborted',
      );
    });
  });

  describe(`--${Flags.username.name} (${Flags.username.constName})`, (): void => {
    it('returns the provided value without prompting', async (): Promise<void> => {
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper();

      const result: unknown = await Flags.username.prompt(fakeTask.asTask(), 'provided');

      expect(result).to.equal('provided');
      expect(fakeTask.recordedCalls).to.have.lengthOf(0);
    });

    it('re-prompts until the answer is alphanumeric', async (): Promise<void> => {
      simulateInteractiveTerminal();
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper(['bad user!', 'gooduser1']);

      const result: unknown = await Flags.username.prompt(fakeTask.asTask(), missingInput);

      expect(result).to.equal('gooduser1');
      expect(fakeTask.recordedCalls).to.have.lengthOf(2);
      expect(fakeTask.recordedCalls[0].options.message).to.equal(
        'Please enter your username. Can only contain letters and numbers:',
      );
    });

    it('validates that the username is alphanumeric', (): void => {
      expect(FlagValidation.violationOf(Flags.username, 'user1')).to.be.undefined;
      expect(FlagValidation.violationOf(Flags.username, 'user 1')).to.not.be.undefined;
      expect(FlagValidation.violationOf(Flags.username, 'user-1')).to.not.be.undefined;
    });
  });

  describe(`--${Flags.context.name} (${Flags.context.constName})`, (): void => {
    it('presents the provided contexts as select choices', async (): Promise<void> => {
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper(['context-2']);

      const result: unknown = await Flags.context.prompt(fakeTask.asTask(), ['context-1', 'context-2']);

      expect(result).to.equal('context-2');
      expect(fakeTask.recordedCalls).to.have.lengthOf(1);
      expect(fakeTask.recordedCalls[0].component).to.equal(selectPrompt);
      expect(fakeTask.recordedCalls[0].options.message).to.equal('Select kubectl context');
      expect(fakeTask.recordedCalls[0].options.choices).to.deep.equal(['context-1', 'context-2']);
    });

    it('mentions the cluster in the message when one is given', async (): Promise<void> => {
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper(['context-1']);

      await Flags.context.prompt(fakeTask.asTask(), ['context-1'], 'cluster-1');

      expect(fakeTask.recordedCalls[0].options.message).to.equal(
        'Select kubectl context to be associated with cluster: cluster-1',
      );
    });
  });

  describe('shared prompt error handling', (): void => {
    it('wraps prompt adapter failures in a flag input error naming the flag', async (): Promise<void> => {
      simulateInteractiveTerminal();
      const fakeTask: FakePromptTaskWrapper = new FakePromptTaskWrapper([], new Error('boom'));

      await expect(Flags.namespace.prompt(fakeTask.asTask(), missingInput)).to.be.rejectedWith(
        FlagInputFailedSoloError,
        "Input validation failed for flag 'namespace': boom",
      );
    });
  });

  describe('coverage completeness', (): void => {
    it('covers every flag that defines a prompt function', (): void => {
      const coveredFlags: Set<CommandFlag> = new Set<CommandFlag>([
        ...textPromptFlags,
        ...togglePromptFlags,
        ...numberPromptFlags,
        ...customPromptFlags,
      ]);

      const uncoveredFlags: string[] = Flags.allFlags
        .filter((flag: CommandFlag): boolean => flag.prompt !== undefined && !coveredFlags.has(flag))
        .map((flag: CommandFlag): string => `${flag.constName} (--${flag.name})`);

      expect(uncoveredFlags).to.deep.equal([]);
    });
  });
});
