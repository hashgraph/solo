// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../core/errors/solo-errors.js';
import {SoloError} from '../core/errors/solo-error.js';
import * as constants from '../core/constants.js';
import {BaseCommand} from './base.js';
import {Flags as flags} from './flags.js';
import {type AnyListrContext, type ArgvStruct} from '../types/aliases.js';
import {type ClusterReferenceName, type Context, type SoloListr, type SoloListrTask} from '../types/index.js';
import {inject, injectable} from 'tsyringe-neo';
import {type CommandFlag, type CommandFlags} from '../types/flag-types.js';
import {ImageCacheHandlerBuilder} from '../integration/cache/impl/image-cache-handler-builder.js';
import {ImageCacheHandler} from '../integration/cache/impl/image-cache-handler.js';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {CachedItem} from '../integration/cache/models/impl/cached-item.js';
import {ArtifactHealthResult} from '../integration/cache/models/impl/artifact-health-result.js';
import fs from 'node:fs/promises';
import {Stats} from 'node:fs';
import {type ContainerEngineClient} from '../integration/container-engine/container-engine-client.js';
import {type CacheCatalogStore} from '../integration/cache/api/cache-catalog-store.js';
import {CacheImageTargetTemplateRenderer} from '../integration/cache/impl/cache-image-target-template-renderer.js';
import {PathEx} from '../business/utils/path-ex.js';
import {CacheImageTemplateValues} from '../integration/cache/models/impl/cache-image-template-values.js';
import * as version from '../../version.js';
import {DefaultCacheImageTemplateResolver} from '../integration/cache/impl/default-cache-image-template-resolver.js';
import {type CacheTarget} from '../integration/cache/models/impl/cache-target.js';
import {HelmChartCacheHandler} from '../integration/cache/impl/helm-chart-cache-handler.js';
import {SoloHelmChartTargetProvider} from '../integration/cache/target-providers/solo-helm-chart-target-provider.js';
import {type HelmClient} from '../integration/helm/helm-client.js';

interface CachePullConfigClass {
  imageCacheHandler: ImageCacheHandler;
  results: readonly CachedItem[];
  edgeEnabled: boolean;
}

interface CachePullContext {
  config: CachePullConfigClass;
}

interface CacheLoadConfigClass {
  imageCacheHandler: ImageCacheHandler;
  clusterReference: ClusterReferenceName;
  context: Context;
}

interface CacheLoadContext {
  config: CacheLoadConfigClass;
}

interface CacheClearConfigClass {
  imageCacheHandler: ImageCacheHandler;
}

interface CacheClearContext {
  config: CacheClearConfigClass;
}

interface CacheStatusConfigClass {
  imageCacheHandler: ImageCacheHandler;
  clusterReference: ClusterReferenceName;
  context: Context;
  clusterName: string;
}

interface CacheStatusContext {
  config: CacheStatusConfigClass;
}

interface CacheListConfigClass {
  imageCacheHandler: ImageCacheHandler;
}

interface CacheListContext {
  config: CacheListConfigClass;
}

interface CacheChartPullConfigClass {
  helmChartCacheHandler: HelmChartCacheHandler;
  results: CachedItem[];
}

interface CacheChartPullContext {
  config: CacheChartPullConfigClass;
}

interface CacheChartConfigClass {
  helmChartCacheHandler: HelmChartCacheHandler;
}

interface CacheChartContext {
  config: CacheChartConfigClass;
}

@injectable()
export class CacheCommand extends BaseCommand {
  public static readonly CACHE_NOT_MATERIALIZED_ERROR_MESSAGE: string =
    'Cache image targets have not been materialized yet. Run `solo cache image pull` first.';

  public constructor(
    @inject(InjectTokens.ContainerEngineClient) private containerEngineClient?: ContainerEngineClient,
    @inject(InjectTokens.Helm) private helmClient?: HelmClient,
    @inject(InjectTokens.CacheCatalogStore) private readonly cacheCatalogStore?: CacheCatalogStore,
  ) {
    super();

    this.containerEngineClient = patchInject(
      containerEngineClient,
      InjectTokens.ContainerEngineClient,
      this.constructor.name,
    );
    this.helmClient = patchInject(helmClient, InjectTokens.Helm, this.constructor.name);
    this.cacheCatalogStore = patchInject(cacheCatalogStore, InjectTokens.CacheCatalogStore, this.constructor.name);
  }

  public async close(): Promise<void> {}

  // ------ Flags ------ //

  public static readonly PULL_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [
      flags.quiet,
      flags.cacheDir,
      flags.debugMode,
      flags.edgeEnabled,

      // Versions
      flags.mirrorNodeVersion,
      flags.blockNodeVersion,
      flags.relayVersion,
      flags.explorerVersion,
    ],
  };

  public static readonly LOAD_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.debugMode, flags.clusterRef],
  };

  public static readonly LIST_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.debugMode],
  };

  public static readonly CLEAR_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.debugMode],
  };

  public static readonly PRUNE_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.debugMode],
  };

  public static readonly STATUS_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.debugMode, flags.clusterRef],
  };

  public static readonly CHART_PULL_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.debugMode],
  };

  public static readonly CHART_LIST_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.debugMode],
  };

  public static readonly CHART_CLEAR_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.debugMode],
  };

  public static readonly CHART_PRUNE_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.debugMode],
  };

  public static readonly CHART_STATUS_FLAGS_LIST: CommandFlags = {
    required: [],
    optional: [flags.quiet, flags.cacheDir, flags.debugMode],
  };

  // ----- Handlers ------- //

  public async pull(argv: ArgvStruct): Promise<boolean> {
    const tasks: SoloListr<CachePullContext> = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<void> => {
            this.configManager.update(argv);

            flags.disablePrompts(CacheCommand.PULL_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...CacheCommand.PULL_FLAGS_LIST.required,
              ...CacheCommand.PULL_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const edgeEnabled: boolean = this.configManager.getFlag(flags.edgeEnabled);

            const renderedYamlPath: string = await this.renderImageTargetsFile(
              edgeEnabled,
              this.configManager.getFlag(flags.mirrorNodeVersion),
              this.configManager.getFlag(flags.blockNodeVersion),
              this.configManager.getFlag(flags.relayVersion),
              this.configManager.getFlag(flags.explorerVersion),
            );

            context_.config = {
              imageCacheHandler: await this.buildImageCacheHandlerFromYaml(renderedYamlPath),
              results: [],
              edgeEnabled,
            };
          },
        },
        this.pullAndCacheContainerImages(),
        this.showUserMessages(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache image pull',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.system.containerOperationFailed('cache pull', error);
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {});
    }

    return true;
  }

  public async load(argv: ArgvStruct): Promise<boolean> {
    const tasks: SoloListr<CacheLoadContext> = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<void> => {
            await this.localConfig.load();

            this.configManager.update(argv);

            flags.disablePrompts(CacheCommand.LOAD_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...CacheCommand.LOAD_FLAGS_LIST.required,
              ...CacheCommand.LOAD_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const clusterReference: ClusterReferenceName = this.getClusterReference();
            const context: Context = this.getClusterContext(clusterReference);
            const cacheDirectory: string = this.configManager.getFlag(flags.cacheDir);

            context_.config = {
              imageCacheHandler: await this.buildImageCacheHandlerFromRenderedFile(cacheDirectory),
              clusterReference,
              context,
            };
          },
        },
        this.loadImagesIntoCluster(),
        this.showUserMessages(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache image load',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.system.containerOperationFailed('cache load', error);
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {});
    }

    return true;
  }

  public async list(): Promise<boolean> {
    const tasks: SoloListr<CacheListContext> = this.taskList.newTaskList(
      [
        {
          title: 'List cached images',
          task: async (context_): Promise<void> => {
            const cacheDirectory: string = this.configManager.getFlag(flags.cacheDir);

            const config: CacheListConfigClass = {
              imageCacheHandler: await this.buildImageCacheHandlerFromRenderedFile(cacheDirectory),
            };

            context_.config = config;

            const cachedItems: readonly CachedItem[] = await config.imageCacheHandler.list();

            try {
              this.logger.showList(
                `Cached images: [${cachedItems.length}]`,
                cachedItems.map((item): string => `${item.target.name}:${item.target.version}`),
              );
            } catch {
              this.logger.warn('No cache manifest found');
            }
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache image list',
    );

    await tasks.run();
    return true;
  }

  public async clear(): Promise<boolean> {
    const tasks: SoloListr<CacheClearContext> = this.taskList.newTaskList(
      [
        {
          title: 'Clear image cache',
          task: async (context_): Promise<void> => {
            const cacheDirectory: string = this.configManager.getFlag(flags.cacheDir);

            const renderedYamlPath: string = this.getRenderedImageTargetsFilePath(cacheDirectory);

            try {
              const config: CacheClearConfigClass = {
                imageCacheHandler: await this.buildImageCacheHandlerFromRenderedFile(cacheDirectory),
              };

              context_.config = config;

              await config.imageCacheHandler.clear();
            } catch (error) {
              if (
                !(error instanceof SoloError) ||
                error.message !== CacheCommand.CACHE_NOT_MATERIALIZED_ERROR_MESSAGE
              ) {
                throw error;
              }
            }

            await fs.rm(renderedYamlPath, {force: true});
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache image clear',
    );

    await tasks.run();
    return true;
  }

  public async prune(): Promise<boolean> {
    const tasks: SoloListr<AnyListrContext> = this.taskList.newTaskList(
      [
        {
          title: 'Prune image cache',
          task: async (): Promise<void> => {
            const cacheDirectory: string = this.configManager.getFlag(flags.cacheDir);

            // Wipe the whole cache directory and the rendered targets file. Idempotent: it does not
            // require the cache to be materialized and never fails when there is nothing to prune.
            await this.cacheCatalogStore.clear();
            await fs.rm(this.getRenderedImageTargetsFilePath(cacheDirectory), {force: true});
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache image prune',
    );

    await tasks.run();
    return true;
  }

  public async status(argv: ArgvStruct): Promise<boolean> {
    const tasks: SoloListr<CacheStatusContext> = this.taskList.newTaskList(
      [
        {
          title: 'Check cache status',
          task: async (context_, task): Promise<void> => {
            this.configManager.update(argv);
            flags.disablePrompts(CacheCommand.STATUS_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...CacheCommand.STATUS_FLAGS_LIST.required,
              ...CacheCommand.STATUS_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            const cacheDirectory: string = this.configManager.getFlag(flags.cacheDir);

            let imageCacheHandler: ImageCacheHandler;
            try {
              imageCacheHandler = await this.buildImageCacheHandlerFromRenderedFile(cacheDirectory);
            } catch (error) {
              // Report an unmaterialized cache cleanly so status stays a reliable pre-deploy check.
              if (error instanceof SoloError && error.message === CacheCommand.CACHE_NOT_MATERIALIZED_ERROR_MESSAGE) {
                this.logger.showUser('Image cache is not materialized. Run `solo cache image pull` to populate it.');
                return;
              }
              throw error;
            }

            const config: CacheStatusConfigClass = {imageCacheHandler} as CacheStatusConfigClass;

            const clusterReference: ClusterReferenceName | undefined = this.configManager.getFlag(flags.clusterRef);

            if (clusterReference) {
              await this.localConfig.load();

              const context: Context = this.getClusterContext(clusterReference);
              config.clusterReference = clusterReference;
              config.context = context;
              config.clusterName = this.prepareClusterName(this.k8Factory.getK8(context).clusters().readCurrent());
            } else {
              try {
                config.clusterName = this.prepareClusterName(this.k8Factory.default().clusters().readCurrent());
              } catch {
                // Best effort only. Local cache status should still work.
              }
            }

            context_.config = config;

            const items: readonly ArtifactHealthResult[] = await config.imageCacheHandler.healthcheck();
            const cachedItems: readonly CachedItem[] = await config.imageCacheHandler.list();
            const expectedTargets: readonly CacheTarget[] = await config.imageCacheHandler.resolveRequiredArtifacts();

            const expectedImages: string[] = expectedTargets.map(
              (target): string => `${target.name}:${target.version}`,
            );

            const missingImages: string[] = items
              .filter((item): boolean => !item.healthy)
              .map((item): string => `${item.target.name}:${item.target.version}`);

            let totalBytes: number = 0;

            for (const item of cachedItems) {
              try {
                const stat: Stats = await fs.stat(item.localPath);
                totalBytes += stat.size;
              } catch {
                // missing files are already reflected by healthcheck
              }
            }

            const totalSizeMb: string = (totalBytes / (1024 * 1024)).toFixed(2);

            this.logger.showUser(`Cached images: ${items.length}`);
            this.logger.showUser(`Total size: ${totalSizeMb} MB`);
            this.logger.showUser(`Healthy: ${missingImages.length === 0}`);

            if (missingImages.length > 0) {
              this.logger.showList('Missing cache archives', missingImages);
            }

            if (!config.clusterName) {
              this.logger.showUser('Cluster images: unavailable');
              return;
            }

            try {
              const clusterImages: readonly string[] = await this.containerEngineClient.listLoadedImagesInCluster(
                config.clusterName,
              );

              const clusterImageSet: Set<string> = new Set(clusterImages);
              const expectedImageSet: Set<string> = new Set(expectedImages);

              const loadedExpectedImages: string[] = expectedImages.filter((image: string): boolean =>
                clusterImageSet.has(image),
              );

              const missingInCluster: string[] = expectedImages.filter((image): boolean => !clusterImageSet.has(image));

              const additionalClusterImages: string[] = clusterImages.filter(
                (image): boolean => !expectedImageSet.has(image),
              );

              this.logger.showUser(
                `Cluster loaded expected images: ${loadedExpectedImages.length}/${expectedImages.length}`,
              );

              if (missingInCluster.length > 0) {
                this.logger.showList('Expected but not loaded in cluster', missingInCluster);
              }

              if (additionalClusterImages.length > 0) {
                this.logger.showList('Additional images loaded in cluster', additionalClusterImages);
              }
            } catch (error) {
              const message: string = error instanceof Error ? error.message : String(error);
              this.logger.showUser(`Cluster images: failed to inspect (${message})`);
            }
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache image status',
    );

    await tasks.run();

    return true;
  }

  public async chartPull(argv: ArgvStruct): Promise<boolean> {
    const tasks: SoloListr<CacheChartPullContext> = this.taskList.newTaskList(
      [
        {
          title: 'Initialize',
          task: async (context_, task): Promise<void> => {
            this.configManager.update(argv);

            flags.disablePrompts(CacheCommand.CHART_PULL_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...CacheCommand.CHART_PULL_FLAGS_LIST.required,
              ...CacheCommand.CHART_PULL_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = {
              helmChartCacheHandler: this.buildHelmChartCacheHandler(),
              results: [],
            };
          },
        },
        this.pullAndCacheHelmCharts(),
        this.showUserMessages(),
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache chart pull',
    );

    if (tasks.isRoot()) {
      try {
        await tasks.run();
      } catch (error) {
        throw new SoloErrors.system.containerOperationFailed('cache chart pull', error);
      }
    } else {
      this.taskList.registerCloseFunction(async (): Promise<void> => {});
    }

    return true;
  }

  public async chartList(): Promise<boolean> {
    const tasks: SoloListr<CacheChartContext> = this.taskList.newTaskList(
      [
        {
          title: 'List cached charts',
          task: async (context_): Promise<void> => {
            context_.config = {helmChartCacheHandler: this.buildHelmChartCacheHandler()};

            const cachedItems: readonly CachedItem[] = await context_.config.helmChartCacheHandler.list();

            this.logger.showList(
              `Cached charts: [${cachedItems.length}]`,
              cachedItems.map((item): string => `${item.target.name || item.target.source}:${item.target.version}`),
            );
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache chart list',
    );

    await tasks.run();
    return true;
  }

  public async chartClear(): Promise<boolean> {
    const tasks: SoloListr<CacheChartContext> = this.taskList.newTaskList(
      [
        {
          title: 'Clear chart cache',
          task: async (context_): Promise<void> => {
            context_.config = {helmChartCacheHandler: this.buildHelmChartCacheHandler()};
            await context_.config.helmChartCacheHandler.clear();
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache chart clear',
    );

    await tasks.run();
    return true;
  }

  public async chartPrune(): Promise<boolean> {
    const tasks: SoloListr<CacheChartContext> = this.taskList.newTaskList(
      [
        {
          title: 'Prune chart cache',
          task: async (context_): Promise<void> => {
            context_.config = {helmChartCacheHandler: this.buildHelmChartCacheHandler()};
            await context_.config.helmChartCacheHandler.prune();
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache chart prune',
    );

    await tasks.run();
    return true;
  }

  public async chartStatus(argv: ArgvStruct): Promise<boolean> {
    const tasks: SoloListr<CacheChartContext> = this.taskList.newTaskList(
      [
        {
          title: 'Check chart cache status',
          task: async (context_, task): Promise<void> => {
            this.configManager.update(argv);
            flags.disablePrompts(CacheCommand.CHART_STATUS_FLAGS_LIST.optional);

            const allFlags: CommandFlag[] = [
              ...CacheCommand.CHART_STATUS_FLAGS_LIST.required,
              ...CacheCommand.CHART_STATUS_FLAGS_LIST.optional,
            ];

            await this.configManager.executePrompt(task, allFlags);

            context_.config = {helmChartCacheHandler: this.buildHelmChartCacheHandler()};

            const items: readonly ArtifactHealthResult[] = await context_.config.helmChartCacheHandler.healthcheck();
            const cachedItems: readonly CachedItem[] = await context_.config.helmChartCacheHandler.list();

            const missingCharts: string[] = items
              .filter((item): boolean => !item.healthy)
              .map((item): string => `${item.target.name || item.target.source}:${item.target.version}`);

            let totalBytes: number = 0;

            for (const item of cachedItems) {
              try {
                const stat: Stats = await fs.stat(item.localPath);
                totalBytes += stat.size;
              } catch {
                // missing files are already reflected by healthcheck
              }
            }

            const totalSizeMb: string = (totalBytes / (1024 * 1024)).toFixed(2);

            this.logger.showUser(`Cached charts: ${cachedItems.length}`);
            this.logger.showUser(`Total size: ${totalSizeMb} MB`);
            this.logger.showUser(`Healthy: ${missingCharts.length === 0}`);

            if (missingCharts.length > 0) {
              this.logger.showList('Missing chart archives', missingCharts);
            }
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
      undefined,
      'cache chart status',
    );

    await tasks.run();
    return true;
  }

  // ------ Tasks ------ //

  private pullAndCacheHelmCharts(): SoloListrTask<CacheChartPullContext> {
    return {
      title: 'Pull and cache helm charts',
      task: async ({config: {helmChartCacheHandler}}, task): Promise<SoloListr<AnyListrContext>> => {
        return task.newListr(
          await helmChartCacheHandler.pull(),
          constants.LISTR_DEFAULT_OPTIONS.WITH_CONCURRENCY_COLLAPSABLE,
        );
      },
    };
  }

  private pullAndCacheContainerImages(): SoloListrTask<CachePullContext> {
    return {
      title: 'Pull and cache container images',
      task: async ({config: {imageCacheHandler}}, task): Promise<SoloListr<AnyListrContext>> => {
        return task.newListr(await imageCacheHandler.pull(), {
          ...constants.LISTR_DEFAULT_RENDERER_COLLAPSABLE_OPTIONS,
          concurrent: constants.CACHE_IMAGE_MAX_CONCURRENCY,
        });
      },
    };
  }

  private loadImagesIntoCluster(): SoloListrTask<CacheLoadContext> {
    return {
      title: 'Load images into cluster',
      task: async ({config: {imageCacheHandler, context}}, task): Promise<SoloListr<CacheLoadContext>> => {
        const clusterName: string = this.prepareClusterName(this.k8Factory.getK8(context).clusters().readCurrent());
        const subTasks: SoloListrTask<CacheLoadContext>[] = await imageCacheHandler.load(clusterName);

        // Load images concurrently, bounded to avoid saturating local disk during ctr import, and
        // keep each step visible after it completes.
        return task.newListr(subTasks, {
          ...constants.LISTR_DEFAULT_RENDERER_COLLAPSABLE_OPTIONS,
          concurrent: constants.CACHE_IMAGE_MAX_CONCURRENCY,
        });
      },
    };
  }

  private showUserMessages(): SoloListrTask<AnyListrContext> {
    return {
      title: 'Show user messages',
      skip: (): boolean => this.oneShotState.isActive(),
      task: (): void => {
        this.logger.showAllMessageGroups();
      },
    };
  }

  // ------ Helpers ------ //

  private prepareClusterName(clusterReference: ClusterReferenceName): string {
    return clusterReference.startsWith('kind-') ? clusterReference.replace('kind-', '') : clusterReference;
  }

  private getRenderedImageTargetsFilePath(cacheDirectory: string): string {
    return PathEx.join(cacheDirectory, 'config', CacheImageTargetTemplateRenderer.RENDERED_FILE_NAME);
  }

  private async renderImageTargetsFile(
    edgeEnabled: boolean,
    mirrorNodeVersion?: string,
    blockNodeVersion?: string,
    relayVersion?: string,
    explorerVersion?: string,
  ): Promise<string> {
    const cacheDirectory: string = this.configManager.getFlag(flags.cacheDir);
    const renderedConfigDirectory: string = PathEx.join(cacheDirectory, 'config');

    return new CacheImageTargetTemplateRenderer(
      new DefaultCacheImageTemplateResolver(
        new CacheImageTemplateValues(
          mirrorNodeVersion || (edgeEnabled ? version.MIRROR_NODE_EDGE_VERSION : version.MIRROR_NODE_VERSION),
          blockNodeVersion || (edgeEnabled ? version.BLOCK_NODE_EDGE_VERSION : version.BLOCK_NODE_VERSION),
          relayVersion ||
            (edgeEnabled ? version.HEDERA_JSON_RPC_RELAY_EDGE_VERSION : version.HEDERA_JSON_RPC_RELAY_VERSION),
          explorerVersion || (edgeEnabled ? version.EXPLORER_EDGE_VERSION : version.EXPLORER_VERSION),

          // These three are external/chart-internal and have no Solo edge variants.
          version.MINIO_OPERATOR_VERSION,
          version.SOLO_CHEETAH_VERSION,
          version.SOLO_CONTAINERS_VERSION,
        ),
      ),
    ).renderToFile(constants.SOLO_CACHE_IMAGES_TARGET_FILE, renderedConfigDirectory);
  }

  private async buildImageCacheHandlerFromYaml(filePath: string): Promise<ImageCacheHandler> {
    return ImageCacheHandlerBuilder.fromYaml(filePath).engine(this.containerEngineClient).build();
  }

  private async buildImageCacheHandlerFromRenderedFile(cacheDirectory: string): Promise<ImageCacheHandler> {
    const renderedYamlPath: string = this.getRenderedImageTargetsFilePath(cacheDirectory);

    try {
      await fs.access(renderedYamlPath);
    } catch {
      throw new SoloErrors.validation.cacheNotMaterialized();
    }

    return this.buildImageCacheHandlerFromYaml(renderedYamlPath);
  }

  private buildHelmChartCacheHandler(): HelmChartCacheHandler {
    return new HelmChartCacheHandler(this.helmClient, new SoloHelmChartTargetProvider());
  }
}
