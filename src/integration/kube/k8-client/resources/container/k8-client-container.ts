// SPDX-License-Identifier: Apache-2.0

import {container} from 'tsyringe-neo';
import type * as WebSocket from 'ws';
import * as tar from 'tar';
import {type Container} from '../../../resources/container/container.js';
import {type TarCreateFilter} from '../../../../../types/aliases.js';
import {type TDirectoryData} from '../../../t-directory-data.js';
import {type ContainerReference} from '../../../resources/container/container-reference.js';
import {IllegalArgumentError} from '../../../../../core/errors/illegal-argument-error.js';
import {MissingArgumentError} from '../../../../../core/errors/missing-argument-error.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import path from 'node:path';
import fs from 'node:fs';
import {type LocalContextObject} from '../../../../../types/index.js';
import * as stream from 'node:stream';
import {v4 as uuid4} from 'uuid';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import os from 'node:os';
import {Exec, type KubeConfig} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {PathEx} from '../../../../../business/utils/path-ex.js';

type EventErrorWithUrl = {name: string; message: string; stack?: string; target?: {url?: string}};

export class K8ClientContainer implements Container {
  private readonly logger: SoloLogger;

  public constructor(
    private readonly kubeConfig: KubeConfig,
    private readonly containerReference: ContainerReference,
    private readonly pods: Pods,
  ) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async copyFrom(sourcePath: string, destinationDirectory: string): Promise<unknown> {
    const self = this;
    const namespace = this.containerReference.parentReference.namespace;
    const guid = uuid4();
    const messagePrefix = `copyFrom[${this.containerReference.parentReference.name},${guid}]: `;

    if (!(await self.pods.read(this.containerReference.parentReference))) {
      throw new IllegalArgumentError(`Invalid pod ${this.containerReference.parentReference.name}`);
    }

    self.logger.info(`${messagePrefix}[srcPath=${sourcePath}, destDir=${destinationDirectory}]`);

    // get stat for source file in the container
    let entries = await self.listDir(sourcePath);
    if (entries.length !== 1) {
      throw new SoloError(`${messagePrefix}invalid source path: ${sourcePath}`);
    }
    // handle symbolic link
    if (entries[0].name.includes(' -> ')) {
      const redirectSourcePath = `${path.dirname(sourcePath)}/${entries[0].name.slice(Math.max(0, entries[0].name.indexOf(' -> ') + 4))}`;
      entries = await self.listDir(redirectSourcePath);
      if (entries.length !== 1) {
        throw new SoloError(`${messagePrefix}invalid source path: ${redirectSourcePath}`);
      }
    }
    const sourceFileDesc = entries[0]; // cache for later comparison after copy

    if (!fs.existsSync(destinationDirectory)) {
      throw new SoloError(`${messagePrefix}invalid destination path: ${destinationDirectory}`);
    }

    const localContext = {} as LocalContextObject;
    try {
      const sourceFileSize = Number.parseInt(sourceFileDesc.size);

      const sourceFile = path.basename(entries[0].name);
      const sourceDirectory = path.dirname(entries[0].name);
      const destinationPath = PathEx.join(destinationDirectory, sourceFile);

      // download the tar file to a temp location
      const temporaryFile = self.tempFileFor(sourceFile);

      return new Promise((resolve, reject) => {
        localContext.reject = reject;
        const execInstance = new Exec(self.kubeConfig);
        const command = ['cat', `${sourceDirectory}/${sourceFile}`];
        const outputFileStream = fs.createWriteStream(temporaryFile);
        const outputPassthroughStream = new stream.PassThrough({highWaterMark: 10 * 1024 * 1024});
        const errorPassthroughStream = new stream.PassThrough();

        // Use pipe() to automatically handle backpressure between streams
        outputPassthroughStream.pipe(outputFileStream);

        self.registerOutputPassthroughStreamOnData(
          localContext,
          messagePrefix,
          outputPassthroughStream,
          outputFileStream,
        );

        self.registerOutputFileStreamOnDrain(localContext, messagePrefix, outputPassthroughStream, outputFileStream);

        execInstance
          .exec(
            namespace.name,
            this.containerReference.parentReference.name.toString(),
            this.containerReference.name.toString(),
            command,
            outputFileStream,
            errorPassthroughStream,
            null,
            false,
            ({status}) => {
              if (status === 'Failure') {
                self.deleteTempFile(temporaryFile);
                return self.exitWithError(localContext, `${messagePrefix} Failure occurred`);
              }
              self.logger.debug(`${messagePrefix} callback(status)=${status}`);
            },
          )
          .then(conn => {
            localContext.connection = conn;

            conn.on('error', error => {
              self.deleteTempFile(temporaryFile);
              return self.exitWithError(
                localContext,
                `${messagePrefix} failed, connection error: ${error.message}`,
                error,
              );
            });

            self.registerConnectionOnMessage(messagePrefix);

            conn.on('close', (code, reason) => {
              self.logger.debug(`${messagePrefix} connection closed`);
              if (code !== 1000) {
                // code 1000 is the success code
                return self.exitWithError(localContext, `${messagePrefix} failed with code=${code}, reason=${reason}`);
              }

              outputFileStream.end();
              outputFileStream.close(() => {
                try {
                  fs.copyFileSync(temporaryFile, destinationPath);

                  self.deleteTempFile(temporaryFile);

                  const stat = fs.statSync(destinationPath);
                  if (stat && stat.size === sourceFileSize) {
                    self.logger.debug(`${messagePrefix} finished`);
                    return resolve(true);
                  }

                  return self.exitWithError(
                    localContext,
                    `${messagePrefix} files did not match, srcFileSize=${sourceFileSize}, stat.size=${stat?.size}`,
                  );
                } catch (error) {
                  return self.exitWithError(localContext, `${messagePrefix} failed to complete download`, error);
                }
              });
            });
          })
          .catch(error => {
            self.exitWithError(localContext, `${messagePrefix} failed to exec copyFrom: ${error.message}`, error);
          });

        self.registerErrorStreamOnData(localContext, errorPassthroughStream);

        self.registerErrorStreamOnError(localContext, messagePrefix, outputFileStream);
      });
    } catch (error) {
      throw new SoloError(`${messagePrefix}failed to download file: ${error.message}`, error);
    }
  }

  public async copyTo(
    sourcePath: string,
    destinationDirectory: string,
    filter: TarCreateFilter | undefined = undefined,
  ): Promise<boolean> {
    const self = this;
    const namespace = this.containerReference.parentReference.namespace;
    const guid = uuid4();
    const messagePrefix = `copyTo[${this.containerReference.parentReference.name},${guid}]: `;

    if (!(await self.pods.read(this.containerReference.parentReference))) {
      throw new IllegalArgumentError(`Invalid pod ${this.containerReference.parentReference.name}`);
    }

    self.logger.info(`${messagePrefix}[srcPath=${sourcePath}, destDir=${destinationDirectory}]`);

    if (!(await this.hasDir(destinationDirectory))) {
      throw new SoloError(`invalid destination path: ${destinationDirectory}`);
    }

    if (!fs.existsSync(sourcePath)) {
      throw new SoloError(`invalid source path: ${sourcePath}`);
    }

    const localContext = {} as LocalContextObject;
    try {
      const sourceFile = path.basename(sourcePath);
      const sourceDirectory = path.dirname(sourcePath);

      // Create a temporary tar file for the source file
      const temporaryFile = self.tempFileFor(sourceFile);

      await tar.c({file: temporaryFile, cwd: sourceDirectory, filter}, [sourceFile]);

      return new Promise<boolean>((resolve, reject) => {
        localContext.reject = reject;
        const execInstance = new Exec(self.kubeConfig);
        const command = ['tar', 'xf', '-', '-C', destinationDirectory];
        const inputStream = fs.createReadStream(temporaryFile);
        const errorPassthroughStream = new stream.PassThrough();
        const inputPassthroughStream = new stream.PassThrough({highWaterMark: 10 * 1024 * 1024}); // Handle backpressure

        // Use pipe() to automatically handle backpressure
        inputStream.pipe(inputPassthroughStream);

        execInstance
          .exec(
            namespace.name,
            this.containerReference.parentReference.name.toString(),
            this.containerReference.name.toString(),
            command,
            null,
            errorPassthroughStream,
            inputPassthroughStream,
            false,
            ({status}) => self.handleCallback(status, localContext, messagePrefix),
          )
          .then(conn => {
            localContext.connection = conn;

            self.registerConnectionOnError(localContext, messagePrefix, conn);

            self.registerConnectionOnMessage(messagePrefix);

            conn.on('close', (code, reason) => {
              self.logger.debug(`${messagePrefix} connection closed`);
              if (code !== 1000) {
                // code 1000 is the success code
                return self.exitWithError(localContext, `${messagePrefix} failed with code=${code}, reason=${reason}`);
              }

              // Cleanup temp file after successful copy
              inputPassthroughStream.end(); // End the passthrough stream
              self.deleteTempFile(temporaryFile); // Cleanup temp file
              self.logger.info(`${messagePrefix} Successfully copied!`);
              return resolve(true);
            });
          })
          .catch(error => {
            self.exitWithError(localContext, `${messagePrefix} failed to copyTo: ${error.message}`, error);
          });

        self.registerErrorStreamOnData(localContext, errorPassthroughStream);

        self.registerErrorStreamOnError(localContext, messagePrefix, inputPassthroughStream);
      });
    } catch (error) {
      throw new SoloError(`${messagePrefix} failed to upload file: ${error.message}`, error);
    }
  }

  public async execContainer(command: string | string[]): Promise<string> {
    const self = this;
    const namespace = this.containerReference.parentReference.namespace;
    const guid = uuid4();
    const messagePrefix = `execContainer[${this.containerReference.parentReference.name},${guid}]:`;

    if (!(await self.pods.read(this.containerReference.parentReference))) {
      throw new IllegalArgumentError(`Invalid pod ${this.containerReference.parentReference.name}`);
    }

    if (!command) {
      throw new MissingArgumentError('command cannot be empty');
    }
    if (!Array.isArray(command)) {
      command = command.split(' ');
    }

    self.logger.info(`${messagePrefix} begin... command=[${command.join(' ')}]`);

    return new Promise<string>((resolve, reject) => {
      const localContext = {} as LocalContextObject;
      localContext.reject = reject;
      const execInstance = new Exec(self.kubeConfig);
      const temporaryFile = self.tempFileFor(`${this.containerReference.parentReference.name}-output.txt`);
      const outputFileStream = fs.createWriteStream(temporaryFile);
      const outputPassthroughStream = new stream.PassThrough({highWaterMark: 10 * 1024 * 1024});
      const errorPassthroughStream = new stream.PassThrough();

      // Use pipe() to automatically handle backpressure between streams
      outputPassthroughStream.pipe(outputFileStream);

      self.registerOutputPassthroughStreamOnData(
        localContext,
        messagePrefix,
        outputPassthroughStream,
        outputFileStream,
      );

      self.registerOutputFileStreamOnDrain(localContext, messagePrefix, outputPassthroughStream, outputFileStream);

      execInstance
        .exec(
          namespace.name,
          this.containerReference.parentReference.name.toString(),
          this.containerReference.name.toString(),
          command,
          outputFileStream,
          errorPassthroughStream,
          null,
          false,
          ({status}) => self.handleCallback(status, localContext, messagePrefix),
        )
        .then(conn => {
          localContext.connection = conn;

          self.registerConnectionOnError(localContext, messagePrefix, conn);

          self.registerConnectionOnMessage(messagePrefix);

          conn.on('close', (code, reason) => {
            self.logger.debug(`${messagePrefix} connection closed`);
            if (!localContext.errorMessage) {
              if (code !== 1000) {
                // code 1000 is the success code
                return self.exitWithError(localContext, `${messagePrefix} failed with code=${code}, reason=${reason}`);
              }

              outputFileStream.end();
              outputFileStream.close(() => {
                self.logger.debug(`${messagePrefix} finished`);
                const outData = fs.readFileSync(temporaryFile);
                return resolve(outData.toString());
              });
            }
          });
        })
        .catch(error => {
          self.exitWithError(localContext, `${messagePrefix} failed to exec command: ${error.message}`, error);
        });

      self.registerErrorStreamOnData(localContext, errorPassthroughStream);

      self.registerErrorStreamOnError(localContext, messagePrefix, outputFileStream);
    });
  }

  public async hasDir(destinationPath: string): Promise<boolean> {
    return (
      (await this.execContainer([
        'bash',
        '-c',
        '[[ -d "' + destinationPath + '" ]] && echo -n "true" || echo -n "false"',
      ])) === 'true'
    );
  }

  public async hasFile(destinationPath: string, filters: object = {}): Promise<boolean> {
    const parentDirectory = path.dirname(destinationPath);
    const fileName = path.basename(destinationPath);
    const filterMap = new Map(Object.entries(filters));

    try {
      const entries = await this.listDir(parentDirectory);

      for (const item of entries) {
        if (item.name === fileName && !item.directory) {
          let found = true;

          for (const entry of filterMap.entries()) {
            const field = entry[0];
            const value = entry[1];
            this.logger.debug(
              `Checking file ${this.containerReference.parentReference.name}:${this.containerReference.name} ${destinationPath}; ${field} expected ${value}, found ${item[field]}`,
              {filters},
            );
            if (`${value}` !== `${item[field]}`) {
              found = false;
              break;
            }
          }

          if (found) {
            this.logger.debug(
              `File check succeeded ${this.containerReference.parentReference.name}:${this.containerReference.name} ${destinationPath}`,
              {
                filters,
              },
            );
            return true;
          }
        }
      }
    } catch (error) {
      throw new SoloError(
        `unable to check file in '${this.containerReference.parentReference.name}':${this.containerReference.name}' - ${destinationPath}: ${error.message}`,
        error,
      );
    }

    return false;
  }

  public async listDir(destinationPath: string): Promise<any[] | TDirectoryData[]> {
    try {
      const output = (await this.execContainer(['ls', '-la', destinationPath])) as string;
      if (!output) {
        return [];
      }

      // parse the output and return the entries
      const items: TDirectoryData[] = [];
      const lines = output.split('\n');
      for (let line of lines) {
        line = line.replaceAll(/\s+/g, '|');
        const parts = line.split('|');
        if (parts.length >= 9) {
          let name = parts.at(-1);
          // handle unique file format (without single quotes): 'usedAddressBook_vHederaSoftwareVersion{hapiVersion=v0.53.0, servicesVersion=v0.53.0}_2024-07-30-20-39-06_node_0.txt.debug'
          for (let index = parts.length - 1; index > 8; index--) {
            name = `${parts[index - 1]} ${name}`;
          }

          if (name !== '.' && name !== '..') {
            const permission = parts[0];
            const item: TDirectoryData = {
              directory: permission[0] === 'd',
              owner: parts[2],
              group: parts[3],
              size: parts[4],
              modifiedAt: `${parts[5]} ${parts[6]} ${parts[7]}`,
              name,
            };

            items.push(item);
          }
        }
      }

      return items;
    } catch (error) {
      throw new SoloError(
        `unable to check path in '${this.containerReference.parentReference.name}':${this.containerReference.name}' - ${destinationPath}: ${error.message}`,
        error,
      );
    }
  }

  public async mkdir(destinationPath: string): Promise<string> {
    return this.execContainer(['bash', '-c', 'mkdir -p "' + destinationPath + '"']);
  }

  private tempFileFor(fileName: string) {
    const temporaryFile = `${fileName}-${uuid4()}`;
    return PathEx.join(os.tmpdir(), temporaryFile);
  }

  private deleteTempFile(temporaryFile: string) {
    if (fs.existsSync(temporaryFile)) {
      fs.rmSync(temporaryFile);
    }
  }

  private exitWithError(localContext: LocalContextObject, errorMessage: string, error?: EventErrorWithUrl) {
    localContext.errorMessage = localContext.errorMessage
      ? `${localContext.errorMessage}:${errorMessage}`
      : errorMessage;
    localContext.errorMessage = error?.target?.url
      ? `${localContext.errorMessage}:${error.target.url}`
      : localContext.errorMessage;
    this.logger.warn(errorMessage);
    return localContext.reject(new SoloError(localContext.errorMessage, error));
  }

  private handleCallback(status: string, localContext: LocalContextObject, messagePrefix: string) {
    if (status === 'Failure') {
      return this.exitWithError(localContext, `${messagePrefix} Failure occurred`);
    }
    this.logger.debug(`${messagePrefix} callback(status)=${status}`);
  }

  private registerConnectionOnError(
    localContext: LocalContextObject,
    messagePrefix: string,
    conn: WebSocket.WebSocket,
  ) {
    conn.on('error', error => {
      return this.exitWithError(localContext, `${messagePrefix} failed, connection error: ${error.message}`, error);
    });
  }

  private registerConnectionOnMessage(messagePrefix: string) {
    this.logger.debug(`${messagePrefix} received message`);
  }

  private registerErrorStreamOnData(localContext: LocalContextObject, stream: stream.PassThrough) {
    stream.on('data', data => {
      localContext.errorMessage = localContext.errorMessage
        ? `${localContext.errorMessage}${data.toString()}`
        : data.toString();
    });
  }

  private registerErrorStreamOnError(
    localContext: LocalContextObject,
    messagePrefix: string,
    stream: stream.PassThrough | fs.WriteStream,
  ) {
    stream.on('error', error => {
      return this.exitWithError(localContext, `${messagePrefix} error encountered, err: ${error.toString()}`, error);
    });
  }

  private registerOutputPassthroughStreamOnData(
    localContext: LocalContextObject,
    messagePrefix: string,
    outputPassthroughStream: stream.PassThrough,
    outputFileStream: fs.WriteStream,
  ) {
    outputPassthroughStream.on('data', chunk => {
      this.logger.debug(`${messagePrefix} received chunk size=${chunk.length}`);
      const canWrite = outputFileStream.write(chunk); // Write chunk to file and check if buffer is full
      if (!canWrite) {
        this.logger.debug(`${messagePrefix} buffer is full, pausing data stream...`);
        outputPassthroughStream.pause(); // Pause the data stream if buffer is full
      }
    });
  }

  private registerOutputFileStreamOnDrain(
    localContext: LocalContextObject,
    messagePrefix: string,
    outputPassthroughStream: stream.PassThrough,
    outputFileStream: fs.WriteStream,
  ) {
    outputFileStream.on('drain', () => {
      outputPassthroughStream.resume();
      this.logger.debug(`${messagePrefix} stream drained, resume write`);
    });
  }
}
