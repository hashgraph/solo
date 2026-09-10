// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import {BaseCommand} from './base.js';
import {SoloErrors} from '../core/errors/solo-errors.js';
import {Flags as flags} from './flags.js';
import {Listr} from 'listr2';
import * as constants from '../core/constants.js';
import {type AccountManager} from '../core/account-manager.js';
import {
  FileCreateTransaction,
  FileUpdateTransaction,
  FileAppendTransaction,
  FileContentsQuery,
  FileInfoQuery,
  FileId,
  Status,
  PrivateKey,
} from '@hiero-ledger/sdk';
import {type ArgvStruct} from '../types/aliases.js';
import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../core/dependency-injection/inject-tokens.js';
import {patchInject} from '../core/dependency-injection/container-helper.js';
import {type CommandFlags} from '../types/flag-types.js';
import {type DeploymentName, type SoloListr, type SoloListrTask} from '../types/index.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import fs from 'node:fs';
import path from 'node:path';

interface FileUploadConfig {
  fileId: string;
  filePath: string;
  deployment: DeploymentName;
  namespace: NamespaceName;
}

interface FileUploadContext {
  config: FileUploadConfig;
  fileExists: boolean;
  fileContent: Uint8Array;
  uploadedSize: number;
  expectedSize: number;
  treasuryPrivateKey: PrivateKey;
}

@injectable()
export class FileCommand extends BaseCommand {
  // Hiero's max content size per transaction
  private static readonly MAX_CHUNK_SIZE = 4096;

  public constructor(@inject(InjectTokens.AccountManager) private readonly accountManager: AccountManager) {
    super();
    this.accountManager = patchInject(accountManager, InjectTokens.AccountManager, this.constructor.name);
  }

  public static CREATE_FLAGS_LIST: CommandFlags = {
    required: [flags.filePath],
    optional: [flags.deployment],
  };

  public static UPDATE_FLAGS_LIST: CommandFlags = {
    required: [flags.fileId, flags.filePath],
    optional: [flags.deployment],
  };

  public async close(): Promise<void> {
    await this.accountManager.close();
  }

  /**
   * Helper method to prepare initial content and determine if append is needed
   * @param fileContent - The complete file content
   * @param operation - The operation being performed ('create' or 'update')
   * @returns Object with initialContent and needsAppend flag
   */
  private prepareInitialContent(
    fileContent: Uint8Array,
    operation: 'create' | 'update',
  ): {initialContent: Uint8Array; needsAppend: boolean} {
    const needsAppend: boolean = fileContent.length > FileCommand.MAX_CHUNK_SIZE;

    let initialContent: Uint8Array;
    if (needsAppend) {
      initialContent = fileContent.slice(0, FileCommand.MAX_CHUNK_SIZE);
      this.logger.showUser(
        chalk.gray(
          `  ${operation === 'create' ? 'Creating' : 'Updating'} file with first ${initialContent.length} bytes (multi-part ${operation})...`,
        ),
      );
    } else {
      initialContent = fileContent;
      this.logger.showUser(
        chalk.gray(`  ${operation === 'create' ? 'Creating' : 'Updating'} file with ${initialContent.length} bytes...`),
      );
    }

    return {initialContent, needsAppend};
  }

  /**
   * Helper method to initialize configuration and read file content
   * @param argv - Command arguments
   * @param requireFileId - Whether file ID is required (true for update, false for create)
   * @returns Configuration context with file content
   */
  private async initializeFileConfig(
    argv: ArgvStruct,
    requireFileId: boolean,
  ): Promise<{
    config: FileUploadConfig;
    fileContent: Uint8Array;
    expectedSize: number;
  }> {
    // Load configurations
    await this.localConfig.load();
    await this.remoteConfig.loadAndValidate(argv);
    this.configManager.update(argv);

    const filePath: string = argv[flags.filePath.name] as string;
    const deployment: DeploymentName = argv[flags.deployment.name] as DeploymentName;
    const namespace: NamespaceName = this.remoteConfig.getNamespace();

    let fileId: string = '';
    if (requireFileId) {
      fileId = argv[flags.fileId.name] as string;
      // Validate file ID format
      if (!/^\d+\.\d+\.\d+$/.test(fileId)) {
        throw new SoloErrors.validation.invalidFileIdFormat(fileId);
      }
    }

    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new SoloErrors.system.fileNotFound(filePath);
    }

    // Read file content
    const fileContent: Buffer = fs.readFileSync(filePath);
    const fileName: string = path.basename(filePath);

    this.logger.showUser(chalk.cyan(`File: ${fileName}`));
    this.logger.showUser(chalk.cyan(`Size: ${fileContent.length} bytes`));
    if (requireFileId) {
      this.logger.showUser(chalk.cyan(`File ID: ${fileId}`));
    }

    const config: FileUploadConfig = {
      fileId,
      filePath,
      deployment,
      namespace,
    };

    return {
      config,
      fileContent,
      expectedSize: fileContent.length,
    };
  }

  /**
   * Helper method to load node client and treasury keys
   * @param namespace - The namespace
   * @param deployment - The deployment name
   * @param useGenesisKeyForSystemFile - Whether to use genesis key for system file operations
   * @returns The private key to use for transactions
   */
  private async loadClientAndKeys(
    namespace: NamespaceName,
    deployment: DeploymentName,
    useGenesisKeyForSystemFile: boolean = false,
  ): Promise<PrivateKey> {
    // Load node client
    await this.accountManager.loadNodeClient(namespace, this.remoteConfig.getClusterRefs(), deployment);

    // Use genesis key for system file operations if requested
    if (useGenesisKeyForSystemFile) {
      this.logger.showUser(chalk.cyan('Using genesis key for system file operations'));
      this.logger.showUser(chalk.gray('  Genesis key can be customized via GENESIS_KEY environment variable'));
      return PrivateKey.fromString(constants.GENESIS_KEY);
    }

    // Get treasury account keys
    const treasuryKeys = await this.accountManager.getTreasuryAccountKeys(namespace, deployment);
    return PrivateKey.fromString(treasuryKeys.privateKey);
  }

  /**
   * Helper method to verify uploaded file content
   * @param client - The Hiero client
   * @param fileId - The file ID to verify
   * @param expectedContent - The expected file content
   */
  private async verifyFileUpload(client: any, fileId: string, expectedContent: Uint8Array): Promise<void> {
    const fileIdObject: FileId = FileId.fromString(fileId);

    this.logger.showUser(chalk.cyan('Querying file contents to verify upload...'));

    const fileContentsQuery: FileContentsQuery = new FileContentsQuery().setFileId(fileIdObject);
    const retrievedContents: Uint8Array = await fileContentsQuery.execute(client);

    const uploadedSize: number = retrievedContents.length;
    const expectedSize: number = expectedContent.length;

    this.logger.showUser(chalk.gray(`  Expected size: ${expectedSize} bytes`));
    this.logger.showUser(chalk.gray(`  Retrieved size: ${uploadedSize} bytes`));

    if (uploadedSize !== expectedSize) {
      // Check if this is a system file (0.0.101-0.0.200 range)
      const fileIdParts: string[] = fileId.split('.');
      const fileNumber: number = Number.parseInt(fileIdParts[2]);
      const isSystemFile: boolean = fileNumber >= 101 && fileNumber <= 200;

      let errorMessage: string = `File size mismatch! Expected ${expectedSize} bytes but got ${uploadedSize} bytes`;
      if (isSystemFile && uploadedSize === 0) {
        errorMessage = `${errorMessage}

⚠️  System File Update Failed:
File ${fileId} is a system file that appears to be immutable or requires special authorization.

Possible reasons:
1. The genesis key may not have permission to update this specific system file
2. System file ${fileId} may require network-level authorization or freeze/unfreeze operations
3. The network may be using a different genesis key than expected

Troubleshooting:
• Verify the correct genesis key using: echo $GENESIS_KEY
• Set custom genesis key: export GENESIS_KEY=<your-genesis-key>
• Check if the file requires special permissions beyond genesis key
• Consider using FileUpdateTransaction with additional authorization in custom code`;
      }
      throw new SoloErrors.component.fileContentVerificationFailed(errorMessage);
    }

    // Also verify content matches
    const contentsMatch: boolean = Buffer.from(retrievedContents).equals(Buffer.from(expectedContent));
    if (!contentsMatch) {
      throw new SoloErrors.component.fileContentMismatch();
    }

    this.logger.showUser(chalk.green('✓ File verification successful'));
    this.logger.showUser(chalk.green(`✓ Size: ${uploadedSize} bytes`));
    this.logger.showUser(chalk.green('✓ Content matches uploaded file'));
  }

  /**
   * Helper method to append remaining file chunks after initial create/update
   * @param task - The Listr task wrapper for updating progress
   * @param client - The Hiero client
   * @param fileId - The file ID to append to
   * @param fileContent - The complete file content
   * @param treasuryPrivateKey - The private key to sign transactions
   */
  private async appendFileChunks(
    task: any,
    client: any,
    fileId: string,
    fileContent: Uint8Array,
    treasuryPrivateKey: PrivateKey,
  ): Promise<void> {
    const fileIdObject: FileId = FileId.fromString(fileId);
    let offset: number = FileCommand.MAX_CHUNK_SIZE;
    let chunkIndex: number = 1;

    // Calculate total chunks needed
    const totalChunks: number = Math.ceil(
      (fileContent.length - FileCommand.MAX_CHUNK_SIZE) / FileCommand.MAX_CHUNK_SIZE,
    );

    while (offset < fileContent.length) {
      const chunk: Uint8Array = fileContent.slice(offset, offset + FileCommand.MAX_CHUNK_SIZE);
      const remaining: number = fileContent.length - offset;

      // Update task title to show progress
      task.title = `Append remaining file content (chunk ${chunkIndex}/${totalChunks})`;

      this.logger.showUser(
        chalk.gray(
          `  Appending chunk ${chunkIndex}/${totalChunks} (${chunk.length} bytes, ${remaining} bytes remaining)...`,
        ),
      );

      const fileAppendTx: FileAppendTransaction = new FileAppendTransaction()
        .setFileId(fileIdObject)
        .setContents(chunk)
        .setMaxTransactionFee(100)
        .freezeWith(client);

      const signedAppendTx: FileAppendTransaction = await fileAppendTx.sign(treasuryPrivateKey);
      const appendResponse: any = await signedAppendTx.execute(client);
      const appendReceipt: any = await appendResponse.getReceipt(client);

      if (appendReceipt.status !== Status.Success) {
        throw new SoloErrors.component.hederaFileAppendFailed(chunkIndex, appendReceipt.status.toString());
      }

      offset += FileCommand.MAX_CHUNK_SIZE;
      chunkIndex++;
    }

    // Update final title
    task.title = `Append remaining file content (${totalChunks} chunks completed)`;
    this.logger.showUser(chalk.green(`✓ Appended ${totalChunks} chunks successfully`));
  }

  /**
   * Unified method to create or update a file on the Hiero network
   * @param argv - Command arguments
   * @param isCreate - True for create operation, false for update
   */
  private async executeFileOperation(argv: ArgvStruct, isCreate: boolean): Promise<boolean> {
    interface Context extends FileUploadContext {
      createdFileId?: string;
      isSystemFile?: boolean;
    }

    const tasks: SoloListr<Context> = new Listr(
      [
        {
          title: 'Initialize configuration',
          task: async context_ => {
            const result: {config: FileUploadConfig; fileContent: Uint8Array; expectedSize: number} =
              await this.initializeFileConfig(argv, !isCreate);
            context_.config = result.config;
            context_.fileContent = result.fileContent;
            context_.expectedSize = result.expectedSize;

            // Check if this is a system file (for update operations)
            if (!isCreate && context_.config.fileId) {
              const fileIdParts: string[] = context_.config.fileId.split('.');
              const fileNumber: number = Number.parseInt(fileIdParts[2]);
              context_.isSystemFile = fileNumber >= 101 && fileNumber <= 200;
            }
          },
        },
        {
          title: 'Load node client and treasury keys',
          task: async context_ => {
            const useGenesisKey: boolean = context_.isSystemFile || false;

            context_.treasuryPrivateKey = await this.loadClientAndKeys(
              context_.config.namespace,
              context_.config.deployment,
              useGenesisKey,
            );
          },
        },
        {
          title: 'Check if file exists',
          skip: () => isCreate, // Skip for create operation
          task: async context_ => {
            const client: any = this.accountManager._nodeClient!;

            try {
              const fileIdObject: FileId = FileId.fromString(context_.config.fileId);
              const fileInfoQuery: FileInfoQuery = new FileInfoQuery().setFileId(fileIdObject);
              const fileInfo: any = await fileInfoQuery.execute(client);

              context_.fileExists = true;
              this.logger.showUser(chalk.green(`File ${context_.config.fileId} exists. Proceeding with update.`));
              this.logger.showUser(chalk.gray(`  Current size: ${fileInfo.size.toString()} bytes`));
              const keysCount: number = fileInfo.keys ? fileInfo.keys.toArray().length : 0;
              this.logger.showUser(chalk.gray(`  Keys: ${keysCount}`));

              // Check if file is a system file (no keys = immutable)
              if (keysCount === 0) {
                if (context_.isSystemFile) {
                  this.logger.showUser(
                    chalk.cyan(
                      `ℹ️  File ${context_.config.fileId} is a system file (no keys). Automatically using genesis key for update.`,
                    ),
                  );
                } else {
                  this.logger.showUser(
                    chalk.yellow(
                      `⚠️  Warning: File ${context_.config.fileId} has no keys but is not in system file range (0.0.101-0.0.200).`,
                    ),
                  );
                  this.logger.showUser(
                    chalk.yellow(
                      '    Update may fail. Set GENESIS_KEY environment variable if this file requires genesis key authorization.',
                    ),
                  );
                }
              }
            } catch (error: any) {
              const error_ =
                error.status === Status.FileDeleted || error.status === Status.InvalidFileId
                  ? new SoloErrors.validation.invalidFileIdFormat(context_.config.fileId)
                  : new SoloErrors.component.hederaFileCreationFailed(error.message);
              throw error_;
            }
          },
        },
        {
          title: isCreate ? 'Create file on Hiero network' : 'Update file on Hiero network',
          task: async (context_, task): Promise<SoloListr<Context>> => {
            const client: any = this.accountManager._nodeClient!;
            const subTasks: SoloListrTask<Context>[] = [
              {
                title: isCreate ? 'Create new file' : 'Update existing file',
                task: async (context__, task): Promise<SoloListr<Context> | void> => {
                  const {initialContent, needsAppend}: {initialContent: Uint8Array; needsAppend: boolean} =
                    this.prepareInitialContent(context__.fileContent, isCreate ? 'create' : 'update');

                  if (isCreate) {
                    // Create new file
                    const fileCreateTx: FileCreateTransaction = new FileCreateTransaction()
                      .setKeys([context__.treasuryPrivateKey.publicKey])
                      .setContents(initialContent)
                      .setMaxTransactionFee(100)
                      .freezeWith(client);

                    const signedTx: FileCreateTransaction = await fileCreateTx.sign(context__.treasuryPrivateKey);
                    const txResponse: any = await signedTx.execute(client);
                    const receipt: any = await txResponse.getReceipt(client);

                    if (receipt.status !== Status.Success) {
                      throw new SoloErrors.component.hederaFileCreationFailed(receipt.status.toString());
                    }

                    const createdFileId: FileId | null = receipt.fileId;
                    context__.createdFileId = createdFileId?.toString();
                    context__.config.fileId = context__.createdFileId!; // Update config with actual file ID

                    this.logger.showUser(chalk.green(`✓ File created with ID: ${context__.createdFileId}`));
                  } else {
                    // Update existing file
                    const fileIdObject: FileId = FileId.fromString(context__.config.fileId);
                    const fileUpdateTx: FileUpdateTransaction = new FileUpdateTransaction()
                      .setFileId(fileIdObject)
                      .setContents(initialContent)
                      .setMaxTransactionFee(100)
                      .freezeWith(client);

                    const signedUpdateTx: FileUpdateTransaction = await fileUpdateTx.sign(context__.treasuryPrivateKey);
                    const updateResponse: any = await signedUpdateTx.execute(client);
                    const updateReceipt: any = await updateResponse.getReceipt(client);

                    if (updateReceipt.status !== Status.Success) {
                      throw new SoloErrors.component.hederaFileUpdateFailed(updateReceipt.status.toString());
                    }

                    this.logger.showUser(chalk.green('✓ File updated successfully'));
                  }

                  // Append remaining content if needed
                  if (needsAppend) {
                    const appendSubtasks: SoloListrTask<Context>[] = [
                      {
                        title: 'Append remaining file content',
                        task: async (context__, appendTask) => {
                          await this.appendFileChunks(
                            appendTask,
                            client,
                            context__.config.fileId,
                            context__.fileContent,
                            context__.treasuryPrivateKey,
                          );
                        },
                      },
                    ];

                    return task.newListr(appendSubtasks, {
                      concurrent: false,
                      rendererOptions: {collapseSubtasks: false},
                    });
                  }
                },
              },
            ];

            // Create or update file

            return task.newListr(subTasks, {
              concurrent: false,
              rendererOptions: {
                collapseSubtasks: false,
              },
            });
          },
        },
        {
          title: 'Verify uploaded file',
          task: async context_ => {
            const client = this.accountManager._nodeClient!;
            await this.verifyFileUpload(client, context_.config.fileId, context_.fileContent);
          },
        },
      ],
      constants.LISTR_DEFAULT_OPTIONS.DEFAULT,
    );

    try {
      await tasks.run();
      const context: Context = tasks.ctx as Context;

      if (isCreate) {
        this.logger.showUser(chalk.green('\n✅ File created successfully!'));
        this.logger.showUser(chalk.cyan(`📄 File ID: ${context.createdFileId}`));
      } else {
        this.logger.showUser(chalk.green('\n✅ File updated successfully!'));
      }
    } catch (error) {
      const error_ = isCreate
        ? new SoloErrors.component.hederaFileCreationFailed(error.message)
        : new SoloErrors.component.hederaFileUpdateFailed(error.message);
      throw error_;
    }

    return true;
  }

  /**
   * Create a new file on the Hiero network
   */
  public async create(argv: ArgvStruct): Promise<boolean> {
    return this.executeFileOperation(argv, true);
  }

  /**
   * Update an existing file on the Hiero network
   */
  public async update(argv: ArgvStruct): Promise<boolean> {
    return this.executeFileOperation(argv, false);
  }
}
