// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import {type SinonStub} from 'sinon';
import sinon from 'sinon';
import {expect} from 'chai';
import {describe, it, afterEach} from 'mocha';
import {SubprocessEnvironment} from '../../../src/core/subprocess-environment.js';
import {SubprocessCommandProfile} from '../../../src/core/subprocess-command-profile.js';
import {type AnyObject} from '../../../src/types/aliases.js';

describe('SubprocessEnvironment', (): void => {
  const temporaryKeys: string[] = [];
  // Some tests (e.g. PATH) override a variable the surrounding process already relies on, not one
  // that is merely absent. Restoring the original value here, rather than always deleting, keeps
  // this file from leaving a follow-on test (or any other file in the same mocha worker) with no
  // PATH at all.
  const originalValuesByKey: Map<string, string | undefined> = new Map<string, string | undefined>();
  const allProfiles: SubprocessCommandProfile[] = Object.values(SubprocessCommandProfile);

  /** Sets an environment variable for the duration of a single test and schedules its restoration. */
  function setTemporaryEnvironmentVariable(name: string, value: string): void {
    if (!originalValuesByKey.has(name)) {
      originalValuesByKey.set(name, process.env[name]);
    }
    temporaryKeys.push(name);
    process.env[name] = value;
  }

  afterEach((): void => {
    for (const key of temporaryKeys) {
      const originalValue: string | undefined = originalValuesByKey.get(key);
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
    temporaryKeys.length = 0;
    originalValuesByKey.clear();
    SubprocessEnvironment.configureOperatorAllowlist({});
    sinon.restore();
  });

  it('includes common base variables that are set in the parent environment', (): void => {
    setTemporaryEnvironmentVariable('LANG', 'en_US.UTF-8');
    // eslint-disable-next-line unicorn/prefer-https
    setTemporaryEnvironmentVariable('HTTPS_PROXY', 'http://proxy.example:8080');

    const environment: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC);

    expect(environment.LANG).to.equal('en_US.UTF-8');
    // eslint-disable-next-line unicorn/prefer-https
    expect(environment.HTTPS_PROXY).to.equal('http://proxy.example:8080');
  });

  it('does not fabricate variables that are absent from the parent environment', (): void => {
    delete process.env.LC_ALL;

    const environment: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC);

    expect(environment).to.not.have.property('LC_ALL');
  });

  it('drops arbitrary secrets for every command profile', (): void => {
    setTemporaryEnvironmentVariable('AWS_SECRET_ACCESS_KEY', 'super-secret');
    setTemporaryEnvironmentVariable('MY_API_TOKEN', 'do-not-leak');

    for (const profile of allProfiles) {
      const environment: Record<string, string> = SubprocessEnvironment.forCommand(profile);
      expect(environment, `profile ${profile}`).to.not.have.property('AWS_SECRET_ACCESS_KEY');
      expect(environment, `profile ${profile}`).to.not.have.property('MY_API_TOKEN');
    }
  });

  it('includes KUBECONFIG only for kubernetes-facing profiles', (): void => {
    setTemporaryEnvironmentVariable('KUBECONFIG', '/home/user/.kube/config');

    const kubernetesProfiles: SubprocessCommandProfile[] = [
      SubprocessCommandProfile.KUBECTL,
      SubprocessCommandProfile.HELM,
      SubprocessCommandProfile.KIND,
    ];
    for (const profile of kubernetesProfiles) {
      expect(SubprocessEnvironment.forCommand(profile), `profile ${profile}`).to.have.property('KUBECONFIG');
    }
    const nonKubernetesProfiles: SubprocessCommandProfile[] = [
      SubprocessCommandProfile.GENERIC,
      SubprocessCommandProfile.BREW,
      SubprocessCommandProfile.NPM,
      SubprocessCommandProfile.CONTAINER_ENGINE,
      SubprocessCommandProfile.GITHUB_CLI,
    ];
    for (const profile of nonKubernetesProfiles) {
      expect(SubprocessEnvironment.forCommand(profile), `profile ${profile}`).to.not.have.property('KUBECONFIG');
    }
  });

  it('forwards DOCKER_CONFIG to helm (OCI registry auth) and the container-engine/kind profiles', (): void => {
    setTemporaryEnvironmentVariable('DOCKER_CONFIG', '/home/user/.docker');

    const dockerConfigProfiles: SubprocessCommandProfile[] = [
      SubprocessCommandProfile.HELM,
      SubprocessCommandProfile.KIND,
      SubprocessCommandProfile.CONTAINER_ENGINE,
    ];
    for (const profile of dockerConfigProfiles) {
      expect(SubprocessEnvironment.forCommand(profile), `profile ${profile}`).to.have.property('DOCKER_CONFIG');
    }
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL)).to.not.have.property('DOCKER_CONFIG');
  });

  it('forwards CONTAINERS_STORAGE_CONF to kind (podman-backed) and the container-engine profile', (): void => {
    setTemporaryEnvironmentVariable('CONTAINERS_STORAGE_CONF', '/home/user/.config/containers/storage.conf');

    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.KIND)).to.have.property('CONTAINERS_STORAGE_CONF');
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.CONTAINER_ENGINE)).to.have.property(
      'CONTAINERS_STORAGE_CONF',
    );
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.HELM)).to.not.have.property(
      'CONTAINERS_STORAGE_CONF',
    );
  });

  it('forwards CONTAINERS_REGISTRIES_CONF to kind (podman-backed) and the container-engine profile', (): void => {
    setTemporaryEnvironmentVariable('CONTAINERS_REGISTRIES_CONF', '/home/user/.solo/config/registries.conf');

    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.KIND)).to.have.property(
      'CONTAINERS_REGISTRIES_CONF',
    );
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.CONTAINER_ENGINE)).to.have.property(
      'CONTAINERS_REGISTRIES_CONF',
    );
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.HELM)).to.not.have.property(
      'CONTAINERS_REGISTRIES_CONF',
    );
  });

  it('forwards the EKS IRSA variables to the helm and kubectl profiles (issue #5895)', (): void => {
    const irsaVariables: Record<string, string> = {
      AWS_ROLE_ARN: 'arn:aws:iam::123456789012:role/solo-deployer',
      AWS_WEB_IDENTITY_TOKEN_FILE: '/var/run/secrets/eks.amazonaws.com/serviceaccount/token',
      AWS_REGION: 'us-east-1',
      AWS_DEFAULT_REGION: 'us-east-1',
      AWS_STS_REGIONAL_ENDPOINTS: 'regional',
    };
    for (const [name, value] of Object.entries(irsaVariables)) {
      setTemporaryEnvironmentVariable(name, value);
    }

    for (const profile of [SubprocessCommandProfile.HELM, SubprocessCommandProfile.KUBECTL]) {
      const environment: Record<string, string> = SubprocessEnvironment.forCommand(profile);
      for (const [name, value] of Object.entries(irsaVariables)) {
        expect(environment[name], `profile ${profile}, variable ${name}`).to.equal(value);
      }
    }
  });

  it('does not forward GKE or AKS variables, which are unverified and opt-in only', (): void => {
    // Deliberate scope: nobody has run Solo against GKE or AKS to establish which names are
    // actually required, and guessing is how the AZURE_AUTHORITY_HOST redirect vector got in.
    // Operators on those platforms use subprocess.additionalEnvironmentVariables until the
    // required set is verified against a real cluster.
    const unverifiedCloudVariables: string[] = [
      'GOOGLE_APPLICATION_CREDENTIALS',
      'CLOUDSDK_CONFIG',
      'USE_GKE_GCLOUD_AUTH_PLUGIN',
      'AZURE_FEDERATED_TOKEN_FILE',
      'AZURE_CLIENT_ID',
      'AZURE_AUTHORITY_HOST',
    ];
    for (const name of unverifiedCloudVariables) {
      setTemporaryEnvironmentVariable(name, 'value');
    }

    for (const profile of allProfiles) {
      const environment: Record<string, string> = SubprocessEnvironment.forCommand(profile);
      for (const name of unverifiedCloudVariables) {
        expect(environment, `profile ${profile}, variable ${name}`).to.not.have.property(name);
      }
    }
  });

  it('withholds cloud variables that redirect trust, credentials or endpoints', (): void => {
    // AWS_CONFIG_FILE can declare `credential_process`, which is arbitrary command execution;
    // the CA bundle and endpoint variables redirect TLS trust and the STS endpoint. None of
    // these is required for workload-identity authentication, so none is allowlisted.
    const redirectVariables: string[] = [
      'AWS_CA_BUNDLE',
      'AWS_ENDPOINT_URL',
      'AWS_CONFIG_FILE',
      'AWS_SHARED_CREDENTIALS_FILE',
      'AZURE_CLIENT_SECRET',
    ];
    for (const name of redirectVariables) {
      setTemporaryEnvironmentVariable(name, 'attacker-controlled');
    }

    for (const profile of allProfiles) {
      const environment: Record<string, string> = SubprocessEnvironment.forCommand(profile);
      for (const name of redirectVariables) {
        expect(environment, `profile ${profile}, variable ${name}`).to.not.have.property(name);
      }
    }
  });

  it('withholds variables that would alter how the spawned tool loads code or trusts TLS', (): void => {
    // The reason this stays an allowlist: these are code-execution and MITM vectors, not
    // secrets, so no name-shape heuristic would catch them.
    const injectionVariables: string[] = [
      'LD_PRELOAD',
      'LD_LIBRARY_PATH',
      'DYLD_INSERT_LIBRARIES',
      'NODE_OPTIONS',
      'NODE_EXTRA_CA_CERTS',
      'BASH_ENV',
      'PYTHONPATH',
      'GIT_SSH_COMMAND',
      'GIT_EXTERNAL_DIFF',
      'SSL_CERT_FILE',
      'SSL_CERT_DIR',
      'CURL_CA_BUNDLE',
      'PS4',
    ];
    for (const name of injectionVariables) {
      setTemporaryEnvironmentVariable(name, '/tmp/attacker-controlled');
    }

    for (const profile of allProfiles) {
      const environment: Record<string, string> = SubprocessEnvironment.forCommand(profile);
      for (const name of injectionVariables) {
        expect(environment, `profile ${profile}, variable ${name}`).to.not.have.property(name);
      }
    }
  });

  it('reports every withheld variable name, including user-defined ones', (): void => {
    // The whole point: a user must be able to answer "was MY variable filtered out?" by
    // searching solo.log for its name. A heuristic that reported only "interesting" names
    // would hide exactly the variable being looked for.
    setTemporaryEnvironmentVariable('MY_CUSTOM_TOOL_SETTING', 'super-secret-value');
    setTemporaryEnvironmentVariable('KUBECONFIG', '/home/user/.kube/config');
    SubprocessEnvironment.resetWithheldReporting();

    let reportedNames: string[] = [];
    SubprocessEnvironment.configureWithheldReporter(
      (_profile: SubprocessCommandProfile, withheldNames: string[]): void => {
        reportedNames = withheldNames;
      },
    );
    SubprocessEnvironment.forCommand(SubprocessCommandProfile.HELM);

    expect(reportedNames).to.include('MY_CUSTOM_TOOL_SETTING');
    // Allowlisted variables are forwarded, so they are not reported as withheld.
    expect(reportedNames).to.not.include('KUBECONFIG');
    // The reporter receives names only; no value ever reaches it.
    expect(reportedNames.join(' ')).to.not.include('super-secret-value');
    const isSorted: boolean = reportedNames.every(
      (name: string, index: number): boolean => index === 0 || reportedNames[index - 1] <= name,
    );
    expect(isSorted, 'reported names should be sorted').to.equal(true);
  });

  it('reports at most once per command profile, so a run cannot be flooded', (): void => {
    setTemporaryEnvironmentVariable('MY_CUSTOM_TOOL_SETTING', 'value');
    SubprocessEnvironment.resetWithheldReporting();

    let invocations: number = 0;
    SubprocessEnvironment.configureWithheldReporter((): void => {
      invocations++;
    });
    for (let index: number = 0; index < 5; index++) {
      SubprocessEnvironment.forCommand(SubprocessCommandProfile.HELM);
    }
    expect(invocations, 'repeat invocations of the same profile report once').to.equal(1);

    // A different profile has a different allowlist, so it reports on its own first use.
    SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL);
    expect(invocations, 'each profile reports once').to.equal(2);
  });

  it('does not report explicit overrides as withheld', (): void => {
    setTemporaryEnvironmentVariable('MY_OVERRIDDEN_SETTING', 'inherited-value');
    SubprocessEnvironment.resetWithheldReporting();

    let reportedNames: string[] = [];
    SubprocessEnvironment.configureWithheldReporter(
      (_profile: SubprocessCommandProfile, withheldNames: string[]): void => {
        reportedNames = withheldNames;
      },
    );
    SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC, {MY_OVERRIDDEN_SETTING: 'override-value'});

    expect(reportedNames).to.not.include('MY_OVERRIDDEN_SETTING');
  });

  it('forwards operator-configured extra variables only to the command they were declared for', (): void => {
    setTemporaryEnvironmentVariable('MY_PLATFORM_SETTING', 'needed-by-a-new-cloud');
    SubprocessEnvironment.configureOperatorAllowlist({
      [SubprocessCommandProfile.KUBECTL]: ['MY_PLATFORM_SETTING'],
    });

    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL).MY_PLATFORM_SETTING).to.equal(
      'needed-by-a-new-cloud',
    );
    // Per-command containment: declaring it for kubectl must not hand it to npm or a container engine.
    const otherProfiles: SubprocessCommandProfile[] = allProfiles.filter(
      (profile: SubprocessCommandProfile): boolean => profile !== SubprocessCommandProfile.KUBECTL,
    );
    for (const profile of otherProfiles) {
      expect(SubprocessEnvironment.forCommand(profile), `profile ${profile}`).to.not.have.property(
        'MY_PLATFORM_SETTING',
      );
    }
  });

  it('refuses operator-configured names that could inject code, redirect trust or redirect credentials', (): void => {
    // A config file is a trust boundary, not a guarantee. Without this, "attacker can write
    // ~/.solo/config" escalates to arbitrary code execution inside a cluster-admin process.
    const refusedRequests: string[] = [
      'LD_PRELOAD',
      'DYLD_INSERT_LIBRARIES',
      'NODE_OPTIONS',
      'BASH_ENV',
      'PYTHONPATH',
      'GIT_SSH_COMMAND',
      'SSL_CERT_FILE',
      'NODE_EXTRA_CA_CERTS',
      'AWS_CA_BUNDLE',
      'AWS_ENDPOINT_URL',
      'AWS_CONFIG_FILE',
      'AZURE_CLIENT_SECRET',
    ];
    for (const name of refusedRequests) {
      setTemporaryEnvironmentVariable(name, '/tmp/attacker-controlled');
    }

    let reportedRefusals: string[] = [];
    const accepted: Partial<Record<SubprocessCommandProfile, readonly string[]>> =
      SubprocessEnvironment.configureOperatorAllowlist(
        {[SubprocessCommandProfile.HELM]: refusedRequests},
        (refusedEntries: string[]): void => {
          reportedRefusals = refusedEntries;
        },
      );

    expect(accepted, 'nothing on the never-passthrough list is accepted').to.deep.equal({});
    expect(reportedRefusals, 'every refusal is reported so it is not silently ignored').to.have.members(
      refusedRequests.map((name: string): string => `helm:${name}`),
    );

    for (const profile of allProfiles) {
      const environment: Record<string, string> = SubprocessEnvironment.forCommand(profile);
      for (const name of refusedRequests) {
        expect(environment, `profile ${profile}, variable ${name}`).to.not.have.property(name);
      }
    }
  });

  it('refuses never-passthrough names regardless of the casing used in the config file', (): void => {
    const accepted: Partial<Record<SubprocessCommandProfile, readonly string[]>> =
      SubprocessEnvironment.configureOperatorAllowlist({
        [SubprocessCommandProfile.HELM]: ['ld_preload', 'Node_Options'],
      });

    expect(accepted).to.deep.equal({});
  });

  it('accepts the safe names in a config list that also contains refused ones', (): void => {
    const accepted: Partial<Record<SubprocessCommandProfile, readonly string[]>> =
      SubprocessEnvironment.configureOperatorAllowlist({
        [SubprocessCommandProfile.HELM]: ['MY_PLATFORM_SETTING', 'LD_PRELOAD', '  '],
      });

    expect(accepted).to.deep.equal({[SubprocessCommandProfile.HELM]: ['MY_PLATFORM_SETTING']});
  });

  it('renders withheld names as bounded, printable identifiers so a log line cannot be forged', (): void => {
    const hostileNames: string[] = [
      'GOOD_NAME',
      'INJECTED\n2026-01-01 FATAL fake log line',
      'HAS SPACES',
      'X'.repeat(200),
    ];

    const lines: string[] = SubprocessEnvironment.renderWithheldNames(hostileNames);
    const rendered: string = lines.join('|');

    expect(rendered).to.include('GOOD_NAME');
    expect(rendered, 'no newline may reach a log line').to.not.include('\n');
    expect(rendered).to.not.include('HAS SPACES');
    expect(rendered).to.include('3 with non-identifier names omitted');
  });

  it('emits every conforming name across chunked lines rather than truncating the search space', (): void => {
    // The documented workflow is grep solo.log for your variable, so a name must not be silently
    // dropped just because it sorts late.
    const manyNames: string[] = Array.from(
      {length: 250},
      (_value: unknown, index: number): string => `NAME_${String(index).padStart(3, '0')}`,
    );

    const lines: string[] = SubprocessEnvironment.renderWithheldNames(manyNames);

    for (const line of lines) {
      expect(line.split(', ').length, 'each line stays bounded').to.be.at.most(100);
    }
    const rendered: string = lines.join(', ');
    expect(rendered, 'the last name is still findable').to.include('NAME_249');
    expect(rendered).to.include('NAME_000');
    expect(rendered).to.not.include('omitted');
  });

  it('applies a total ceiling so a pathological environment cannot flood the log', (): void => {
    const floodNames: string[] = Array.from({length: 2500}, (_value: unknown, index: number): string => `N_${index}`);

    const lines: string[] = SubprocessEnvironment.renderWithheldNames(floodNames);

    expect(lines.at(-1)).to.include('500 further name(s) omitted');
  });

  it('refuses per-service AWS endpoint overrides such as AWS_ENDPOINT_URL_STS', (): void => {
    // AWS honours AWS_ENDPOINT_URL_<SERVICE>, and the STS form takes precedence over the global
    // setting - refusing only the exact AWS_ENDPOINT_URL name would leave the EKS credential
    // flow redirectable by a one-line config entry.
    const endpointOverrides: string[] = ['AWS_ENDPOINT_URL_STS', 'aws_endpoint_url_sts', 'AWS_ENDPOINT_URL_S3'];
    for (const name of endpointOverrides) {
      setTemporaryEnvironmentVariable(name, 'https://attacker.example');
    }

    const accepted: Partial<Record<SubprocessCommandProfile, readonly string[]>> =
      SubprocessEnvironment.configureOperatorAllowlist({
        [SubprocessCommandProfile.HELM]: endpointOverrides,
        [SubprocessCommandProfile.KUBECTL]: endpointOverrides,
      });

    expect(accepted, 'no per-service endpoint override is accepted').to.deep.equal({});
    for (const profile of [SubprocessCommandProfile.HELM, SubprocessCommandProfile.KUBECTL]) {
      const environment: Record<string, string> = SubprocessEnvironment.forCommand(profile);
      for (const name of endpointOverrides) {
        expect(environment, `profile ${profile}, variable ${name}`).to.not.have.property(name);
      }
    }
  });

  it('refuses loader-family names by prefix, not just the enumerated ones', (): void => {
    const accepted: Partial<Record<SubprocessCommandProfile, readonly string[]>> =
      SubprocessEnvironment.configureOperatorAllowlist({
        [SubprocessCommandProfile.HELM]: ['LD_AUDIT_UNLISTED', 'DYLD_SOMETHING_NEW'],
      });

    expect(accepted).to.deep.equal({});
  });

  it('matches HELM_ prefixed variables only for the helm profile', (): void => {
    setTemporaryEnvironmentVariable('HELM_REPOSITORY_CONFIG', '/home/user/.config/helm/repositories.yaml');

    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.HELM)).to.have.property('HELM_REPOSITORY_CONFIG');
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL)).to.not.have.property(
      'HELM_REPOSITORY_CONFIG',
    );
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC)).to.not.have.property(
      'HELM_REPOSITORY_CONFIG',
    );
  });

  it('matches HOMEBREW_ prefixed variables only for the brew profile', (): void => {
    setTemporaryEnvironmentVariable('HOMEBREW_NO_ANALYTICS', '1');

    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.BREW)).to.have.property('HOMEBREW_NO_ANALYTICS');
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC)).to.not.have.property(
      'HOMEBREW_NO_ANALYTICS',
    );
  });

  it('includes GitHub CLI credentials only for the github-cli profile', (): void => {
    setTemporaryEnvironmentVariable('GH_TOKEN', 'ghp_example');
    setTemporaryEnvironmentVariable('GITHUB_TOKEN', 'ghp_example2');

    const githubEnvironment: Record<string, string> = SubprocessEnvironment.forCommand(
      SubprocessCommandProfile.GITHUB_CLI,
    );
    expect(githubEnvironment).to.have.property('GH_TOKEN');
    expect(githubEnvironment).to.have.property('GITHUB_TOKEN');

    const genericEnvironment: Record<string, string> = SubprocessEnvironment.forCommand(
      SubprocessCommandProfile.GENERIC,
    );
    expect(genericEnvironment).to.not.have.property('GH_TOKEN');
    expect(genericEnvironment).to.not.have.property('GITHUB_TOKEN');
  });

  /** Case-insensitive key lookup — Windows may surface env var names in any case (e.g. SYSTEMROOT). */
  function hasKeyIgnoreCase(environment: Record<string, string>, key: string): boolean {
    return Object.keys(environment).some((name: string): boolean => name.toLowerCase() === key.toLowerCase());
  }

  it('includes Windows-only variables only on Windows', (): void => {
    setTemporaryEnvironmentVariable('SystemRoot', String.raw`C:\Windows`);
    setTemporaryEnvironmentVariable('PATHEXT', '.COM;.EXE;.BAT');

    const windowsStub: SinonStub = sinon.stub(SubprocessEnvironment as AnyObject, 'isWindowsPlatform').returns(true);
    const onWindows: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL);
    expect(hasKeyIgnoreCase(onWindows, 'SystemRoot'), 'SystemRoot on windows').to.equal(true);
    expect(hasKeyIgnoreCase(onWindows, 'PATHEXT'), 'PATHEXT on windows').to.equal(true);

    windowsStub.returns(false);
    const onPosix: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL);
    expect(hasKeyIgnoreCase(onPosix, 'SystemRoot'), 'SystemRoot on posix').to.equal(false);
    expect(hasKeyIgnoreCase(onPosix, 'PATHEXT'), 'PATHEXT on posix').to.equal(false);
  });

  it('matches Windows allowlist entries case-insensitively (e.g. Git-bash SYSTEMROOT)', (): void => {
    // Git-bash / MSYS surfaces the variable uppercased; the allowlist lists it as 'SystemRoot'.
    setTemporaryEnvironmentVariable('SYSTEMROOT', String.raw`C:\Windows`);

    sinon.stub(SubprocessEnvironment as AnyObject, 'isWindowsPlatform').returns(true);
    const onWindows: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL);
    expect(hasKeyIgnoreCase(onWindows, 'SystemRoot'), 'uppercase SYSTEMROOT is forwarded').to.equal(true);
    expect(onWindows).to.have.property('SYSTEMROOT'); // original casing preserved for the child
  });

  it('applies overrides last, winning over inherited values and bypassing the allowlist', (): void => {
    setTemporaryEnvironmentVariable('PATH', '/usr/bin');

    const environment: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC, {
      PATH: '/custom/bin:/usr/bin',
      KUBECONFIG: '/dev/null',
    });

    // override replaces the inherited value
    expect(environment.PATH).to.equal('/custom/bin:/usr/bin');
    // override is present even though KUBECONFIG is not on the generic allowlist
    expect(environment.KUBECONFIG).to.equal('/dev/null');
  });

  describe('session environment state', (): void => {
    afterEach((): void => {
      SubprocessEnvironment.resetForTesting();
    });

    it('forwards a session variable only to profiles whose allowlist includes it', (): void => {
      SubprocessEnvironment.setSessionVariable('CONTAINERS_CONF', '/solo/config/containers.conf');

      expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.CONTAINER_ENGINE).CONTAINERS_CONF).to.equal(
        '/solo/config/containers.conf',
      );
      expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.KIND).CONTAINERS_CONF).to.equal(
        '/solo/config/containers.conf',
      );
      expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.HELM)).to.not.have.property('CONTAINERS_CONF');
    });

    it('lets a session variable override the inherited parent value', (): void => {
      setTemporaryEnvironmentVariable('KUBECONFIG', '/home/user/.kube/config');
      SubprocessEnvironment.setSessionVariable('KUBECONFIG', '/solo/kubeconfig');

      expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL).KUBECONFIG).to.equal(
        '/solo/kubeconfig',
      );
    });

    it('rejects PATH as a session variable regardless of casing', (): void => {
      for (const name of ['PATH', 'Path', 'path']) {
        expect((): void => SubprocessEnvironment.setSessionVariable(name, '/custom/bin'), name).to.throw(
          'PATH must be registered with prependSessionPath/appendSessionPath',
        );
      }
    });

    it('exposes session variables through the sessionVariable getter', (): void => {
      expect(SubprocessEnvironment.sessionVariable('KIND_EXPERIMENTAL_PROVIDER')).to.equal(undefined);

      SubprocessEnvironment.setSessionVariable('KIND_EXPERIMENTAL_PROVIDER', 'podman');

      expect(SubprocessEnvironment.sessionVariable('KIND_EXPERIMENTAL_PROVIDER')).to.equal('podman');
    });

    it('wraps the inherited PATH with the session path additions', (): void => {
      setTemporaryEnvironmentVariable('PATH', '/usr/bin');
      SubprocessEnvironment.prependSessionPath('/home/linuxbrew/.linuxbrew/bin');
      SubprocessEnvironment.appendSessionPath('/opt/podman/bin');

      const environment: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC);

      const expectedPath: string = ['/home/linuxbrew/.linuxbrew/bin', '/usr/bin', '/opt/podman/bin'].join(
        path.delimiter,
      );
      expect(environment.PATH).to.equal(expectedPath);
      expect(SubprocessEnvironment.currentPath()).to.equal(expectedPath);
    });

    it('gives the most recently prepended directory the highest precedence', (): void => {
      setTemporaryEnvironmentVariable('PATH', '/usr/bin');
      SubprocessEnvironment.prependSessionPath('/first');
      SubprocessEnvironment.prependSessionPath('/second');

      expect(SubprocessEnvironment.currentPath()).to.equal(['/second', '/first', '/usr/bin'].join(path.delimiter));
    });

    it('ignores duplicate session path registrations', (): void => {
      setTemporaryEnvironmentVariable('PATH', '/usr/bin');
      SubprocessEnvironment.prependSessionPath('/solo/bin');
      SubprocessEnvironment.appendSessionPath('/solo/bin');
      SubprocessEnvironment.appendSessionPath('/solo/bin');

      expect(SubprocessEnvironment.currentPath()).to.equal(['/solo/bin', '/usr/bin'].join(path.delimiter));
    });

    it('still applies overrides last, winning over session values', (): void => {
      SubprocessEnvironment.setSessionVariable('KUBECONFIG', '/solo/kubeconfig');
      SubprocessEnvironment.appendSessionPath('/solo/bin');

      const environment: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL, {
        KUBECONFIG: '/dev/null',
        PATH: '/custom/bin',
      });

      expect(environment.KUBECONFIG).to.equal('/dev/null');
      expect(environment.PATH).to.equal('/custom/bin');
    });
  });
});
