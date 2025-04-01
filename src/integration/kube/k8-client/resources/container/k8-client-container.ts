// SPDX-License-Identifier: Apache-2.0

import {container} from 'tsyringe-neo';
import type * as WebSocket from 'ws';
import * as tar from 'tar';
import {type Container} from '../../../resources/container/container.js';
import {type TarCreateFilter} from '../../../../../types/aliases.js';
import {type TDirectoryData} from '../../../t-directory-data.js';
import {type ContainerRef} from '../../../resources/container/container-ref.js';
import {IllegalArgumentError} from '../../../../../core/errors/illegal-argument-error.js';
import {MissingArgumentError} from '../../../../../core/errors/missing-argument-error.js';
import {SoloError} from '../../../../../core/errors/solo-error.js';
import path from 'path';
import fs from 'fs';
import {type LocalContextObject} from '../../../../../types/index.js';
import * as stream from 'node:stream';
import {v4 as uuid4} from 'uuid';
import {type SoloLogger} from '../../../../../core/logging/solo-logger.js';
import os from 'os';
import {Exec, type KubeConfig} from '@kubernetes/client-node';
import {type Pods} from '../../../resources/pod/pods.js';
import {InjectTokens} from '../../../../../core/dependency-injection/inject-tokens.js';
import {PathEx} from '../../../../../business/utils/path-ex.js';

type EventErrorWithUrl = {name: string; message: string; stack?: string; target?: {url?: string}};

export class K8ClientContainer implements Container {
  private readonly logger: SoloLogger;

  public constructor(
    private readonly kubeConfig: KubeConfig,
    private readonly containerRef: ContainerRef,
    private readonly pods: Pods,
  ) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async copyFrom(srcPath: string, destDir: string): Promise<unknown> {
    const self = this;
    const namespace = this.containerRef.parentRef.namespace;
    const guid = uuid4();
    const messagePrefix = `copyFrom[${this.containerRef.parentRef.name},${guid}]: `;

    if (!(await self.pods.read(this.containerRef.parentRef)))
      throw new IllegalArgumentError(`Invalid pod ${this.containerRef.parentRef.name}`);

    self.logger.info(`${messagePrefix}[srcPath=${srcPath}, destDir=${destDir}]`);

    // get stat for source file in the container
    let entries = await self.listDir(srcPath);
    if (entries.length !== 1) {
      throw new SoloError(`${messagePrefix}invalid source path: ${srcPath}`);
    }
    // handle symbolic link
    if (entries[0].name.includes(' -> ')) {
      const redirectSrcPath = `${path.dirname(srcPath)}/${entries[0].name.substring(entries[0].name.indexOf(' -> ') + 4)}`;
      entries = await self.listDir(redirectSrcPath);
      if (entries.length !== 1) {
        throw new SoloError(`${messagePrefix}invalid source path: ${redirectSrcPath}`);
      }
    }
    const srcFileDesc = entries[0]; // cache for later comparison after copy

    if (!fs.existsSync(destDir)) {
      throw new SoloError(`${messagePrefix}invalid destination path: ${destDir}`);
    }

    const localContext = {} as LocalContextObject;
    try {
      const srcFileSize = Number.parseInt(srcFileDesc.size);

      const srcFile = path.basename(entries[0].name);
      const srcDir = path.dirname(entries[0].name);
      const destPath = PathEx.join(destDir, srcFile);

      // download the tar file to a temp location
      const tmpFile = self.tempFileFor(srcFile);

      return new Promise((resolve, reject) => {
        localContext.reject = reject;
        const execInstance = new Exec(self.kubeConfig);
        const command = ['cat', `${srcDir}/${srcFile}`];
        const outputFileStream = fs.createWriteStream(tmpFile);
        const outputPassthroughStream = new stream.PassThrough({highWaterMark: 10 * 1024 * 1024});
        const errPassthroughStream = new stream.PassThrough();

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
            this.containerRef.parentRef.name.toString(),
            this.containerRef.name.toString(),
            command,
            outputFileStream,
            errPassthroughStream,
            null,
            false,
            ({status}) => {
              if (status === 'Failure') {
                self.deleteTempFile(tmpFile);
                return self.exitWithError(localContext, `${messagePrefix} Failure occurred`);
              }
              self.logger.debug(`${messagePrefix} callback(status)=${status}`);
            },
          )
          .then(conn => {
            localContext.connection = conn;

            conn.on('error', e => {
              self.deleteTempFile(tmpFile);
              return self.exitWithError(localContext, `${messagePrefix} failed, connection error: ${e.message}`, e);
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
                  fs.copyFileSync(tmpFile, destPath);

                  self.deleteTempFile(tmpFile);

                  const stat = fs.statSync(destPath);
                  if (stat && stat.size === srcFileSize) {
                    self.logger.debug(`${messagePrefix} finished`);
                    return resolve(true);
                  }

                  return self.exitWithError(
                    localContext,
                    `${messagePrefix} files did not match, srcFileSize=${srcFileSize}, stat.size=${stat?.size}`,
                  );
                } catch (e) {
                  return self.exitWithError(localContext, `${messagePrefix} failed to complete download`, e);
                }
              });
            });
          })
          .catch(e => {
            self.exitWithError(localContext, `${messagePrefix} failed to exec copyFrom: ${e.message}`, e);
          });

        self.registerErrorStreamOnData(localContext, errPassthroughStream);

        self.registerErrorStreamOnError(localContext, messagePrefix, outputFileStream);
      });
    } catch (e) {
      throw new SoloError(`${messagePrefix}failed to download file: ${e.message}`, e);
    }
  }

  public async copyTo(
    srcPath: string,
    destDir: string,
    filter: TarCreateFilter | undefined = undefined,
  ): Promise<boolean> {
    const self = this;
    const namespace = this.containerRef.parentRef.namespace;
    const guid = uuid4();
    const messagePrefix = `copyTo[${this.containerRef.parentRef.name},${guid}]: `;

    if (!(await self.pods.read(this.containerRef.parentRef)))
      throw new IllegalArgumentError(`Invalid pod ${this.containerRef.parentRef.name}`);

    self.logger.info(`${messagePrefix}[srcPath=${srcPath}, destDir=${destDir}]`);

    if (!(await this.hasDir(destDir))) {
      throw new SoloError(`invalid destination path: ${destDir}`);
    }

    if (!fs.existsSync(srcPath)) {
      throw new SoloError(`invalid source path: ${srcPath}`);
    }

    const localContext = {} as LocalContextObject;
    try {
      const srcFile = path.basename(srcPath);
      const srcDir = path.dirname(srcPath);

      // Create a temporary tar file for the source file
      const tmpFile = self.tempFileFor(srcFile);

      await tar.c({file: tmpFile, cwd: srcDir, filter}, [srcFile]);

      return new Promise<boolean>((resolve, reject) => {
        localContext.reject = reject;
        const execInstance = new Exec(self.kubeConfig);
        const command = ['tar', 'xf', '-', '-C', destDir];
        const inputStream = fs.createReadStream(tmpFile);
        const errPassthroughStream = new stream.PassThrough();
        const inputPassthroughStream = new stream.PassThrough({highWaterMark: 10 * 1024 * 1024}); // Handle backpressure

        // Use pipe() to automatically handle backpressure
        inputStream.pipe(inputPassthroughStream);

        execInstance
          .exec(
            namespace.name,
            this.containerRef.parentRef.name.toString(),
            this.containerRef.name.toString(),
            command,
            null,
            errPassthroughStream,
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
              self.deleteTempFile(tmpFile); // Cleanup temp file
              self.logger.info(`${messagePrefix} Successfully copied!`);
              return resolve(true);
            });
          })
          .catch(e => {
            self.exitWithError(localContext, `${messagePrefix} failed to copyTo: ${e.message}`, e);
          });

        self.registerErrorStreamOnData(localContext, errPassthroughStream);

        self.registerErrorStreamOnError(localContext, messagePrefix, inputPassthroughStream);
      });
    } catch (e) {
      throw new SoloError(`${messagePrefix} failed to upload file: ${e.message}`, e);
    }
  }

  public async execContainer(command: string | string[]): Promise<string> {
    const self = this;
    const namespace = this.containerRef.parentRef.namespace;
    const guid = uuid4();
    const messagePrefix = `execContainer[${this.containerRef.parentRef.name},${guid}]:`;

    if (!(await self.pods.read(this.containerRef.parentRef)))
      throw new IllegalArgumentError(`Invalid pod ${this.containerRef.parentRef.name}`);

    if (!command) throw new MissingArgumentError('command cannot be empty');
    if (!Array.isArray(command)) {
      command = command.split(' ');
    }

    self.logger.info(`${messagePrefix} begin... command=[${command.join(' ')}]`);

    return new Promise<string>((resolve, reject) => {
      const localContext = {} as LocalContextObject;
      localContext.reject = reject;
      const execInstance = new Exec(self.kubeConfig);
      const tmpFile = self.tempFileFor(`${this.containerRef.parentRef.name}-output.txt`);
      const outputFileStream = fs.createWriteStream(tmpFile);
      const outputPassthroughStream = new stream.PassThrough({highWaterMark: 10 * 1024 * 1024});
      const errPassthroughStream = new stream.PassThrough();

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
          this.containerRef.parentRef.name.toString(),
          this.containerRef.name.toString(),
          command,
          outputFileStream,
          errPassthroughStream,
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
                const outData = fs.readFileSync(tmpFile);
                return resolve(outData.toString());
              });
            }
          });
        })
        .catch(e => {
          self.exitWithError(localContext, `${messagePrefix} failed to exec command: ${e.message}`, e);
        });

      self.registerErrorStreamOnData(localContext, errPassthroughStream);

      self.registerErrorStreamOnError(localContext, messagePrefix, outputFileStream);
    });
  }

  public async hasDir(destPath: string): Promise<boolean> {
    return (
      (await this.execContainer(['bash', '-c', '[[ -d "' + destPath + '" ]] && echo -n "true" || echo -n "false"'])) ===
      'true'
    );
  }

  public async hasFile(destPath: string, filters: object = {}): Promise<boolean> {
    const parentDir = path.dirname(destPath);
    const fileName = path.basename(destPath);
    const filterMap = new Map(Object.entries(filters));

    try {
      const entries = await this.listDir(parentDir);

      for (const item of entries) {
        if (item.name === fileName && !item.directory) {
          let found = true;

          for (const entry of filterMap.entries()) {
            const field = entry[0];
            const value = entry[1];
            this.logger.debug(
              `Checking file ${this.containerRef.parentRef.name}:${this.containerRef.name} ${destPath}; ${field} expected ${value}, found ${item[field]}`,
              {filters},
            );
            if (`${value}` !== `${item[field]}`) {
              found = false;
              break;
            }
          }

          if (found) {
            this.logger.debug(
              `File check succeeded ${this.containerRef.parentRef.name}:${this.containerRef.name} ${destPath}`,
              {
                filters,
              },
            );
            return true;
          }
        }
      }
    } catch (e) {
      throw new SoloError(
        `unable to check file in '${this.containerRef.parentRef.name}':${this.containerRef.name}' - ${destPath}: ${e.message}`,
        e,
      );
    }

    return false;
  }

  public async listDir(destPath: string): Promise<any[] | TDirectoryData[]> {
    try {
      const output = (await this.execContainer(['ls', '-la', destPath])) as string;
      if (!output) return [];

      // parse the output and return the entries
      const items: TDirectoryData[] = [];
      const lines = output.split('\n');
      for (let line of lines) {
        line = line.replace(/\s+/g, '|');
        const parts = line.split('|');
        if (parts.length >= 9) {
          let name = parts.at(-1);
          // handle unique file format (without single quotes): 'usedAddressBook_vHederaSoftwareVersion{hapiVersion=v0.53.0, servicesVersion=v0.53.0}_2024-07-30-20-39-06_node_0.txt.debug'
          for (let i = parts.length - 1; i > 8; i--) {
            name = `${parts[i - 1]} ${name}`;
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
    } catch (e) {
      throw new SoloError(
        `unable to check path in '${this.containerRef.parentRef.name}':${this.containerRef.name}' - ${destPath}: ${e.message}`,
        e,
      );
    }
  }

  public async mkdir(destPath: string): Promise<string> {
    return this.execContainer(['bash', '-c', 'mkdir -p "' + destPath + '"']);
  }

  private tempFileFor(fileName: string) {
    const tmpFile = `${fileName}-${uuid4()}`;
    return PathEx.join(os.tmpdir(), tmpFile);
  }

  private deleteTempFile(tmpFile: string) {
    if (fs.existsSync(tmpFile)) {
      fs.rmSync(tmpFile);
    }
  }

  private exitWithError(localContext: LocalContextObject, errorMessage: string, e?: EventErrorWithUrl) {
    localContext.errorMessage = localContext.errorMessage
      ? `${localContext.errorMessage}:${errorMessage}`
      : errorMessage;
    localContext.errorMessage = e?.target?.url
      ? `${localContext.errorMessage}:${e.target.url}`
      : localContext.errorMessage;
    this.logger.warn(errorMessage);
    return localContext.reject(new SoloError(localContext.errorMessage, e));
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
    conn.on('error', e => {
      return this.exitWithError(localContext, `${messagePrefix} failed, connection error: ${e.message}`, e);
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
    stream.on('error', err => {
      return this.exitWithError(localContext, `${messagePrefix} error encountered, err: ${err.toString()}`, err);
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
