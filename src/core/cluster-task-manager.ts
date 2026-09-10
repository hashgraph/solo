// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {ShellRunner} from './shell-runner.js';
import {SubprocessCommandProfile} from './subprocess-command-profile.js';
import {SubprocessEnvironment} from './subprocess-environment.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {OsPackageManager} from './package-managers/os-package-manager.js';
import {BrewPackageManager} from './package-managers/brew-package-manager.js';
import {type PackageManager} from './package-managers/package-manager.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {PodmanMode, SoloListrTask, type SoloListrTaskWrapper} from '../types/index.js';
import {SoloErrors} from './errors/solo-errors.js';
import * as constants from './constants.js';
import {getTemporaryDirectory} from './helpers.js';
import fs from 'node:fs';
import os from 'node:os';
import * as yaml from 'yaml';
import {type AnyObject} from '../types/aliases.js';
import path from 'node:path';
import {PodmanRuntimeConfigurationFailedSoloError} from './errors/classes/system/podman-runtime-configuration-failed-solo-error.js';
import {KindClient} from '../integration/kind/kind-client.js';
import {ClusterCreateResponse} from '../integration/kind/model/create-cluster/cluster-create-response.js';
import {type ClusterCreateOptions} from '../integration/kind/model/create-cluster/cluster-create-options.js';
import {ClusterCreateOptionsBuilder} from '../integration/kind/model/create-cluster/create-cluster-options-builder.js';
import {type DefaultKindClientBuilder} from '../integration/kind/impl/default-kind-client-builder.js';
import {type DependencyManager, KindDependencyManager, PodmanDependencyManager} from './dependency-managers/index.js';
import {K8} from '../integration/kube/k8.js';
import {MissingActiveContextError} from '../integration/kube/errors/missing-active-context-error.js';
import {MissingActiveClusterError} from '../integration/kube/errors/missing-active-cluster-error.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type GitClient} from '../integration/git/git-client.js';
import {ImageCacheHandler} from '../integration/cache/impl/image-cache-handler.js';
import {KindNodeImageTargetProvider} from '../integration/cache/target-providers/kind-image-target-provider.js';
import {ImageCacheHandlerBuilder} from '../integration/cache/impl/image-cache-handler-builder.js';
import {type ContainerEngineClient} from '../integration/container-engine/container-engine-client.js';

@injectable()
export class ClusterTaskManager extends ShellRunner {
  // Podman is installed via Homebrew rather than the native package manager because some distros
  // (notably Ubuntu/apt) ship a podman that is too old for kind; brew provides a current build.
  private readonly brewPackageManager: BrewPackageManager = new BrewPackageManager();

  // True only when this process created the local Kind cluster from the small-memory config, whose
  // extraPortMappings publish the one-shot NodePorts on the host. Stays false when cluster creation
  // was skipped (a cluster already existed) or a KIND_CLUSTER_CONFIG_FILE override was used, so
  // callers can fall back to kubectl port-forwards.
  private oneShotHostPortsPublished: boolean = false;

  public get createdClusterWithOneShotPortMappings(): boolean {
    return this.oneShotHostPortsPublished;
  }

  public constructor(
    @inject(InjectTokens.OsPackageManager) protected readonly osPackageManager: OsPackageManager,
    @inject(InjectTokens.KindBuilder) protected readonly kindBuilder: DefaultKindClientBuilder,
    @inject(InjectTokens.PodmanDependencyManager) protected readonly podmanDependencyManager: PodmanDependencyManager,
    @inject(InjectTokens.KindDependencyManager) protected readonly kindDependencyManager: KindDependencyManager,
    @inject(InjectTokens.PodmanInstallationDirectory) protected readonly podmanInstallationDirectory: string,
    @inject(InjectTokens.K8Factory) protected readonly k8Factory: K8Factory,
    @inject(InjectTokens.DependencyManager) protected readonly depManager: DependencyManager,
    @inject(InjectTokens.KindInstallationDirectory) protected readonly kindInstallationDirectory: string,
    @inject(InjectTokens.GitClient) protected readonly gitClient: GitClient,
    @inject(InjectTokens.ContainerEngineClient) protected readonly containerEngineClient: ContainerEngineClient,
  ) {
    super();

    this.osPackageManager = patchInject(osPackageManager, InjectTokens.OsPackageManager, ClusterTaskManager.name);
    this.kindBuilder = patchInject(kindBuilder, InjectTokens.KindBuilder, ClusterTaskManager.name);
    this.podmanDependencyManager = patchInject(
      podmanDependencyManager,
      InjectTokens.KindBuilder,
      ClusterTaskManager.name,
    );
    this.kindDependencyManager = patchInject(kindDependencyManager, InjectTokens.KindBuilder, ClusterTaskManager.name);
    this.podmanInstallationDirectory = patchInject(
      podmanInstallationDirectory,
      InjectTokens.PodmanInstallationDirectory,
      ClusterTaskManager.name,
    );
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, ClusterTaskManager.name);
    this.depManager = patchInject(depManager, InjectTokens.DependencyManager, ClusterTaskManager.name);
    this.kindInstallationDirectory = patchInject(
      kindInstallationDirectory,
      InjectTokens.KindInstallationDirectory,
      ClusterTaskManager.name,
    );
    this.gitClient = patchInject(gitClient, InjectTokens.GitClient, ClusterTaskManager.name);
    this.containerEngineClient = patchInject(
      containerEngineClient,
      InjectTokens.ContainerEngineClient,
      ClusterTaskManager.name,
    );
  }

  private sudoCallbacks(task: SoloListrTaskWrapper<AnyObject>): {
    onSudoRequested: (message: string) => void;
    onSudoGranted: (message: string) => void;
  } {
    const originalTitle: string = task.title;
    const onSudoRequested: (message: string) => void = (message: string): void => {
      task.title = message;
    };
    const onSudoGranted: (message: string) => void = (message: string): void => {
      void message;
      task.title = originalTitle;
    };
    return {onSudoGranted, onSudoRequested};
  }

  public rootfullInstallTasks(
    parentTask: SoloListrTaskWrapper<AnyObject>,
    useSmallMemoryCluster: boolean,
  ): SoloListrTask<AnyObject>[] {
    return [
      {
        title: 'Install git, iptables...',
        task: async (): Promise<void> => {
          try {
            await this.gitClient.version();
          } catch {
            this.logger.info('Git not found, installing git...');
            const {onSudoGranted, onSudoRequested} = this.sudoCallbacks(parentTask);
            const packageManager: PackageManager = this.osPackageManager.getPackageManager();
            packageManager.setOnSudoGranted(onSudoGranted);
            packageManager.setOnSudoRequested(onSudoRequested);
            await packageManager.update();
            await packageManager.installPackages(['git', 'iptables']);
          }
        },
      },
      {
        title: 'Install brew...',
        task: async (): Promise<void> => {
          const brewInstalled: boolean = await this.brewPackageManager.isAvailable();
          if (!brewInstalled) {
            this.logger.info('Homebrew not found, installing Homebrew...');
            if (!(await this.brewPackageManager.install())) {
              throw new SoloErrors.system.homebrewInstallFailed();
            }
          }
        },
      },
      {
        title: 'Install podman...',
        task: async (): Promise<void> => {
          try {
            const podmanVersion: string[] = await this.run('podman', ['--version'], {
              commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
            });
            this.logger.info(`Podman already installed: ${podmanVersion}`);
          } catch {
            this.logger.info('Podman not found, installing Podman...');
            await this.brewPackageManager.installPackages(['podman']);
            const brewBin: string[] = await this.run('which', ['podman']);
            SubprocessEnvironment.appendSessionPath(brewBin.join('').replace('/podman', ''));
          }
        },
      } as SoloListrTask<AnyObject>,
      {
        title: 'Configure podman container runtime...',
        task: async (_context: AnyObject, task: SoloListrTaskWrapper<AnyObject>): Promise<void> => {
          void _context;
          await this.configureBrewPodmanRuntime(task);
        },
      } as SoloListrTask<AnyObject>,
      {
        title: 'Creating local cluster...',
        task: async (_context: AnyObject, task: SoloListrTaskWrapper<AnyObject>): Promise<void> => {
          void _context;
          const whichPodman: string[] = await this.run('which', ['podman']);
          const podmanPath: string = whichPodman.join('').replace('/podman', '');
          const sudoEnvironment: Record<string, string> = {
            PATH:
              `${this.podmanInstallationDirectory}${path.delimiter}` +
              `${this.kindInstallationDirectory}${path.delimiter}${SubprocessEnvironment.currentPath()}`,
          };
          // PATH must include both kindInstallationDirectory (for kind) and podmanPath (for podman).
          const kindRuntimePath: string = `${sudoEnvironment.PATH}${path.delimiter}${podmanPath}`;
          // podman picks its OCI runtime from absolute paths, not from PATH, so extending PATH above
          // is not enough to keep it away from an older distribution crun. configureBrewPodmanRuntime
          // pins the runtime through CONTAINERS_CONF, but only for a Homebrew-managed podman; this
          // covers the self-contained bundles it deliberately leaves alone. CONTAINERS_CONF_OVERRIDE
          // layers on top of CONTAINERS_CONF, so the two compose when both apply.
          const runtimeOverridePath: string | undefined = PodmanDependencyManager.writeRuntimeOverride(
            podmanPath,
            constants.SOLO_HOME_DIR,
          );
          const {onSudoGranted, onSudoRequested} = this.sudoCallbacks(task);
          const kindConfigFilePath: string = this.getConfigFilePath(useSmallMemoryCluster);
          // Use `sudo env VAR=... PATH=... kind ...` instead of a shell env-var prefix so no shell is needed.
          await this.sudoRun(
            onSudoRequested,
            onSudoGranted,
            'env',
            [
              'KIND_EXPERIMENTAL_PROVIDER=podman',
              `PATH=${kindRuntimePath}`,
              ...PodmanDependencyManager.toEnvironmentArguments(
                this.podmanDependencyManager.containerConfigEnvironment(),
              ),
              ...(runtimeOverridePath ? [`CONTAINERS_CONF_OVERRIDE=${runtimeOverridePath}`] : []),
              'kind',
              'create',
              'cluster',
              '--image',
              constants.KIND_NODE_IMAGE,
              '--config',
              kindConfigFilePath,
            ],
            false,
            false,
            sudoEnvironment,
            SubprocessCommandProfile.KIND,
          );
          // getConfigFilePath returns a path other than KIND_CLUSTER_CONFIG_FILE only for the
          // rendered small-memory config, which carries the one-shot extraPortMappings.
          this.oneShotHostPortsPublished = kindConfigFilePath !== constants.KIND_CLUSTER_CONFIG_FILE;

          // Merge kubeconfig data from root user into normal user's kubeconfig
          const user: string[] = await this.run('whoami');
          const temporaryDirectory: string = getTemporaryDirectory();
          const rootKubeConfigPath: string = `${temporaryDirectory}/kube-config-root`;

          await this.sudoRun(
            onSudoRequested,
            onSudoGranted,
            'cp',
            ['/root/.kube/config', rootKubeConfigPath],
            false,
            false,
            sudoEnvironment,
          );
          await this.sudoRun(
            onSudoRequested,
            onSudoGranted,
            'chown',
            [user.join('').trim(), rootKubeConfigPath],
            false,
            false,
            sudoEnvironment,
          );
          await this.sudoRun(
            onSudoRequested,
            onSudoGranted,
            'chmod',
            ['755', rootKubeConfigPath],
            false,
            false,
            sudoEnvironment,
          );

          const rootYamlData: string = fs.readFileSync(rootKubeConfigPath, 'utf8');
          const rootConfig: Record<string, AnyObject> = yaml.parse(rootYamlData) as Record<string, AnyObject>;

          let userConfig: Record<string, AnyObject>;
          const clusterName: string = 'kind-kind';

          try {
            const userYamlData: string = fs.readFileSync(`/home/${user}/.kube/config`, 'utf8');
            userConfig = yaml.parse(userYamlData) as Record<string, AnyObject>;

            if (!userConfig.clusters) {
              userConfig.clusters = [];
            }
            userConfig.clusters.push(rootConfig.clusters.find((c: AnyObject): boolean => c.name === clusterName));

            if (!userConfig.contexts) {
              userConfig.contexts = [];
            }
            userConfig.contexts.push(rootConfig.contexts.find((c: AnyObject): boolean => c.name === clusterName));

            if (!userConfig.users) {
              userConfig.users = [];
            }
            userConfig.users.push(rootConfig.users.find((c: AnyObject): boolean => c.name === clusterName));

            userConfig['current-context'] = rootConfig['current-context'];
          } catch (error) {
            if (error.code === 'ENOENT') {
              const kubeConfigDirectory: string = `/home/${user}/.kube/`;
              if (!fs.existsSync(kubeConfigDirectory)) {
                fs.mkdirSync(kubeConfigDirectory, {recursive: true});
              }
              userConfig = rootConfig;
              userConfig.clusters = userConfig.clusters.filter((c: AnyObject): boolean => c.name === clusterName);
              userConfig.contexts = userConfig.contexts.filter((c: AnyObject): boolean => c.name === clusterName);
              userConfig.users = userConfig.users.filter((c: AnyObject): boolean => c.name === clusterName);
            } else {
              throw error;
            }
          }

          fs.writeFileSync(`/home/${user}/.kube/config`, yaml.stringify(userConfig), 'utf8');
          fs.rmSync(`${temporaryDirectory}/kube-config-root`);
        },
      } as SoloListrTask<AnyObject>,
    ];
  }

  /**
   * Installs the network helpers Homebrew does not package (netavark, aardvark-dns), generates the
   * solo-owned container configuration for the brew podman, and probes the assembled stack. A host
   * whose podman is not Homebrew-managed is left untouched — its container stack is presumed
   * self-consistent, and only the brew podman suffers version skew against a stale system stack
   * under /etc/containers.
   */
  private async configureBrewPodmanRuntime(task: SoloListrTaskWrapper<AnyObject>): Promise<void> {
    const podmanBinaryDirectory: string | undefined = await this.resolveBrewPodmanBinaryDirectory();
    if (!podmanBinaryDirectory) {
      this.logger.info('podman is not Homebrew-managed; leaving the host container configuration untouched');
      return;
    }

    // The netavark/aardvark-dns helpers publish x86_64 binaries only, so fail early and clearly on
    // any other architecture rather than downloading a binary the host cannot execute.
    if (os.arch() !== 'x64') {
      throw new SoloErrors.system.podmanRuntimeConfigurationFailed(
        `Homebrew podman on ${os.arch()} Linux is unsupported: the netavark and aardvark-dns network ` +
          'helpers are published for x86_64 only',
      );
    }

    // Installing the helpers and generating the configuration are the fatal steps; wrap their
    // failures (GitHub download, missing template) in the actionable runtime-configuration error.
    try {
      for (const helper of [constants.NETAVARK, constants.AARDVARK_DNS]) {
        await this.depManager.checkDependency(helper);
      }

      for (const runtimeBinary of ['crun', 'conmon']) {
        const binaryPath: string = path.join(podmanBinaryDirectory, runtimeBinary);
        if (!fs.existsSync(binaryPath)) {
          throw new SoloErrors.system.podmanRuntimeConfigurationFailed(
            `${runtimeBinary} was not found at ${binaryPath}; the Homebrew podman installation appears incomplete`,
          );
        }
      }

      await this.podmanDependencyManager.setupConfig(podmanBinaryDirectory);
    } catch (error) {
      if (error instanceof PodmanRuntimeConfigurationFailedSoloError) {
        throw error;
      }
      throw new SoloErrors.system.podmanRuntimeConfigurationFailed(
        'failed to install the network helpers or generate the container configuration',
        error,
      );
    }

    // Best-effort probe: `kind create cluster` runs podman with this same configuration and is the
    // real gate, so a transient `podman info` failure should warn rather than block an otherwise
    // valid setup.
    const {onSudoGranted, onSudoRequested} = this.sudoCallbacks(task);
    const configurationArguments: string[] = PodmanDependencyManager.toEnvironmentArguments(
      this.podmanDependencyManager.containerConfigEnvironment(),
    );
    try {
      await this.sudoRun(
        onSudoRequested,
        onSudoGranted,
        'env',
        [
          `PATH=${podmanBinaryDirectory}${path.delimiter}${SubprocessEnvironment.currentPath()}`,
          ...configurationArguments,
          'podman',
          'info',
        ],
        false,
        false,
        {},
        SubprocessCommandProfile.CONTAINER_ENGINE,
      );
    } catch (error) {
      this.logger.warn(
        'podman info probe failed after configuring the container runtime; continuing to cluster ' +
          `creation, which will surface any real configuration problem: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Resolves the directory of the podman binary when — and only when — it is Homebrew-managed
   * (resolves from inside the brew prefix); returns undefined for a distribution podman or when
   * podman/brew are absent.
   */
  private async resolveBrewPodmanBinaryDirectory(): Promise<string | undefined> {
    let podmanPath: string;
    try {
      const whichPodman: string[] = await this.run('which', ['podman']);
      podmanPath = whichPodman.join('').trim();
    } catch {
      // podman is not on the PATH, so there is no brew installation to configure
      return undefined;
    }
    if (!podmanPath) {
      return undefined;
    }

    try {
      const brewPrefixOutput: string[] = await this.run('brew', ['--prefix'], {
        commandProfile: SubprocessCommandProfile.BREW,
      });
      const brewPrefix: string = brewPrefixOutput.join('').trim();
      if (brewPrefix && podmanPath.startsWith(`${brewPrefix}${path.sep}`)) {
        return path.dirname(podmanPath);
      }
    } catch {
      // brew is unavailable, so the podman on the PATH cannot be Homebrew-managed
    }
    return undefined;
  }

  public async installationTasks(
    parentTask: SoloListrTaskWrapper<AnyObject>,
    useSmallMemoryCluster: boolean = false,
  ): Promise<SoloListrTask<AnyObject>[]> {
    const skipPodmanTasks: boolean = !(await this.podmanDependencyManager.shouldInstall());
    if (this.podmanDependencyManager.mode === PodmanMode.ROOTFUL) {
      {
        return skipPodmanTasks
          ? [this.defaultCreateClusterTask(parentTask, useSmallMemoryCluster)]
          : this.rootfullInstallTasks(parentTask, useSmallMemoryCluster);
      }
    } else if (this.podmanDependencyManager.mode === PodmanMode.VIRTUAL_MACHINE) {
      {
        return [
          {
            title: 'Create Podman machine...',
            task: async (): Promise<void> => {
              const podmanEnvironment: Record<string, string> = {
                PATH: `${this.podmanInstallationDirectory}${path.delimiter}${SubprocessEnvironment.currentPath()}`,
              };
              await this.podmanDependencyManager.setupConfig();
              const podmanExecutable: string = await this.podmanDependencyManager.getExecutable();
              try {
                await this.run(podmanExecutable, ['machine', 'inspect', constants.PODMAN_MACHINE_NAME], {
                  environmentVariablesToAppend: podmanEnvironment,
                  commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
                });
              } catch (error) {
                if (error.message.includes('VM does not exist')) {
                  await this.run(
                    podmanExecutable,
                    ['machine', 'init', constants.PODMAN_MACHINE_NAME, '--memory=16384'], // 16GB
                    {
                      environmentVariablesToAppend: podmanEnvironment,
                      commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
                    },
                  );
                  await this.run(podmanExecutable, ['machine', 'start', constants.PODMAN_MACHINE_NAME], {
                    environmentVariablesToAppend: podmanEnvironment,
                    commandProfile: SubprocessCommandProfile.CONTAINER_ENGINE,
                  });
                } else {
                  throw new SoloErrors.system.podmanMachineInspectFailed(error);
                }
              }
            },
            skip: (): boolean => skipPodmanTasks,
          } as SoloListrTask<AnyObject>,
          {
            title: 'Configure kind to use podman...',
            task: async (): Promise<void> => {
              SubprocessEnvironment.setSessionVariable('KIND_EXPERIMENTAL_PROVIDER', constants.PODMAN);
            },
            skip: (): boolean => skipPodmanTasks,
          } as SoloListrTask<AnyObject>,
          this.defaultCreateClusterTask(parentTask, useSmallMemoryCluster),
        ];
      }
    }

    return [];
  }

  private defaultCreateClusterTask(
    parentTask: SoloListrTaskWrapper<AnyObject>,
    useSmallMemoryCluster: boolean = false,
  ): SoloListrTask<AnyObject> {
    return {
      title: 'Creating local cluster...',
      task: async (): Promise<void> => {
        const kindExecutable: string = await this.kindDependencyManager.getExecutable();
        const kindClient: KindClient = await this.kindBuilder.executable(kindExecutable).build();

        if (constants.CONFIG.ENABLE_IMAGE_CACHE) {
          const kindImageCacheHandler: ImageCacheHandler = new ImageCacheHandlerBuilder()
            .provider(new KindNodeImageTargetProvider())
            .engine(this.containerEngineClient)
            .build();

          await kindImageCacheHandler.pullKindNodeImageIfMissing();
          await kindImageCacheHandler.loadKindNodeImageIntoEngine();
        }

        const kindConfigFilePath: string = this.getConfigFilePath(useSmallMemoryCluster);
        const clusterCreateOptions: ClusterCreateOptions = ClusterCreateOptionsBuilder.builder()
          .image(constants.KIND_NODE_IMAGE)
          .config(kindConfigFilePath)
          .build();

        const clusterResponse: ClusterCreateResponse = await kindClient.createCluster(
          constants.DEFAULT_CLUSTER,
          clusterCreateOptions,
        );

        // getConfigFilePath returns a path other than KIND_CLUSTER_CONFIG_FILE only for the
        // rendered small-memory config, which carries the one-shot extraPortMappings.
        this.oneShotHostPortsPublished = kindConfigFilePath !== constants.KIND_CLUSTER_CONFIG_FILE;

        parentTask.title = `Created local cluster '${clusterResponse.name}'; connect with context '${clusterResponse.context}'`;
      },
    } as SoloListrTask<AnyObject>;
  }

  private getConfigFilePath(useSmallMemoryCluster: boolean): string {
    let kindConfigFilePath: string = constants.KIND_CLUSTER_CONFIG_FILE;
    if (useSmallMemoryCluster && kindConfigFilePath === constants.DEFAULT_KIND_CLUSTER_CONFIG_FILE) {
      kindConfigFilePath = this.renderSmallMemoryClusterConfig();
      this.logger.info(`Using small memory cluster configuration: ${kindConfigFilePath}`);
    }
    return kindConfigFilePath;
  }

  /**
   * Stages the small-memory Kind configuration and its patches directory under the Solo cache
   * directory (`~/.solo/cache`) and rewrites the patches `hostPath` to an absolute path.
   *
   * @returns the absolute path to the rendered small-memory Kind configuration file.
   */
  private renderSmallMemoryClusterConfig(): string {
    const sourceConfigFilePath: string = path.join(
      constants.RESOURCES_DIR,
      'templates',
      'small-memory',
      'kind-config.yaml',
    );
    const sourcePatchesDirectory: string = path.join(constants.RESOURCES_DIR, 'templates', 'small-memory', 'patches');

    const stagedDirectory: string = path.join(constants.SOLO_CACHE_DIR, 'templates', 'small-memory');
    const stagedPatchesDirectory: string = path.join(stagedDirectory, 'patches');
    const stagedConfigFilePath: string = path.join(stagedDirectory, 'kind-config.yaml');

    fs.mkdirSync(stagedDirectory, {recursive: true});
    fs.cpSync(sourcePatchesDirectory, stagedPatchesDirectory, {recursive: true, force: true});

    const kindConfig: Record<string, AnyObject> = yaml.parse(fs.readFileSync(sourceConfigFilePath, 'utf8')) as Record<
      string,
      AnyObject
    >;
    for (const node of (kindConfig.nodes ?? []) as AnyObject[]) {
      for (const extraMount of (node.extraMounts ?? []) as AnyObject[]) {
        if (extraMount.containerPath === '/patches') {
          extraMount.hostPath = stagedPatchesDirectory;
        }
      }
    }

    fs.writeFileSync(stagedConfigFilePath, yaml.stringify(kindConfig), 'utf8');
    return stagedConfigFilePath;
  }

  public setupLocalClusterTasks(useSmallMemoryCluster: boolean = false): SoloListrTask<AnyObject>[] {
    return [
      {
        title: 'Install Kind',
        task: async (_context: AnyObject, task: SoloListrTaskWrapper<AnyObject>): Promise<unknown> => {
          void _context;
          const podmanDependency: PodmanDependencyManager = this.podmanDependencyManager;
          const shouldInstallPodman: boolean = await podmanDependency.shouldInstall();

          const podmanDependencies: string[] =
            shouldInstallPodman && podmanDependency.mode === PodmanMode.VIRTUAL_MACHINE
              ? [constants.PODMAN, constants.VFKIT, constants.GVPROXY]
              : [];

          const deps: string[] = [...podmanDependencies, constants.KIND];

          const subTasks: SoloListrTask<AnyObject>[] = this.depManager.taskCheckDependencies<AnyObject>(deps);

          // set up the sub-tasks
          return task.newListr(subTasks, {
            concurrent: true,
            rendererOptions: {
              collapseSubtasks: false,
            },
          });
        },
        skip: this.skipKindSetup.bind(this),
      },
      {
        title: 'Create default cluster',
        task: async (_context: AnyObject, task: SoloListrTaskWrapper<AnyObject>): Promise<unknown> => {
          void _context;
          const subTasks: SoloListrTask<AnyObject>[] = await this.installationTasks(task, useSmallMemoryCluster);
          return task.newListr(subTasks, {
            concurrent: false, // should not use concurrent as cluster creation may be called before dependencies are finished installing
            rendererOptions: {
              collapseSubtasks: false,
            },
          });
        },
        skip: this.skipKindSetup.bind(this),
      },
    ];
  }

  private async skipKindSetup(): Promise<boolean> {
    try {
      const k8: K8 = this.k8Factory.default();
      const contextName: string = k8.contexts().readCurrent();
      if (!contextName) {
        return false;
      }

      // Try to verify the cluster is actually accessible by making a simple API call
      try {
        await k8.namespaces().list();
        return true;
      } catch {
        // If we can't connect to the cluster, don't skip cluster creation
        // This handles cases where contexts exist but clusters are not running
        return false;
      }
    } catch (error) {
      return !(error instanceof MissingActiveContextError || error instanceof MissingActiveClusterError);
    }
  }
}
