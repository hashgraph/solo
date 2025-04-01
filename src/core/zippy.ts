// SPDX-License-Identifier: Apache-2.0

import {SoloError} from './errors/solo-error.js';
import {IllegalArgumentError} from './errors/illegal-argument-error.js';
import {MissingArgumentError} from './errors/missing-argument-error.js';
import fs from 'fs';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import chalk from 'chalk';
import path from 'path';
import {type SoloLogger} from './logging/solo-logger.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';

@injectable()
export class Zippy {
  constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  /**
   * Zip a file or directory
   * @param srcPath - path to a file or directory
   * @param destPath - path to the output zip file
   * @param [verbose] - if true, log the progress
   * @returns path to the output zip file
   */
  async zip(sourcePath: string, destinationPath: string, verbose = false) {
    if (!sourcePath) throw new MissingArgumentError('srcPath is required');
    if (!destinationPath) throw new MissingArgumentError('destPath is required');
    if (!destinationPath.endsWith('.zip')) throw new MissingArgumentError('destPath must be a path to a zip file');

    try {
      const zip = new AdmZip('', {});

      const stat = fs.statSync(sourcePath);
      if (stat.isDirectory()) {
        zip.addLocalFolder(sourcePath, '');
      } else {
        zip.addFile(path.basename(sourcePath), fs.readFileSync(sourcePath), '', stat as any);
      }

      await zip.writeZipPromise(destinationPath, {overwrite: true});

      return destinationPath;
    } catch (error: Error | any) {
      throw new SoloError(`failed to unzip ${sourcePath}: ${error.message}`, error);
    }
  }

  unzip(sourcePath: string, destinationPath: string, verbose = false) {
    const self = this;

    if (!sourcePath) throw new MissingArgumentError('srcPath is required');
    if (!destinationPath) throw new MissingArgumentError('destPath is required');

    if (!fs.existsSync(sourcePath)) throw new IllegalArgumentError('srcPath does not exists', sourcePath);

    try {
      const zip = new AdmZip(sourcePath, {readEntries: true});

      for (const zipEntry of zip.getEntries()) {
        if (verbose) {
          self.logger.debug(`Extracting file: ${zipEntry.entryName} -> ${destinationPath}/${zipEntry.entryName} ...`, {
            src: zipEntry.entryName,
            dst: `${destinationPath}/${zipEntry.entryName}`,
          });
        }

        zip.extractEntryTo(zipEntry, destinationPath, true, true, true, zipEntry.entryName);
        if (verbose) {
          self.logger.showUser(
            chalk.green('OK'),
            `Extracted: ${zipEntry.entryName} -> ${destinationPath}/${zipEntry.entryName}`,
          );
        }
      }

      return destinationPath;
    } catch (error: Error | any) {
      throw new SoloError(`failed to unzip ${sourcePath}: ${error.message}`, error);
    }
  }

  tar(sourcePath: string, destinationPath: string) {
    if (!sourcePath) throw new MissingArgumentError('srcPath is required');
    if (!destinationPath) throw new MissingArgumentError('destPath is required');
    if (!destinationPath.endsWith('.tar.gz'))
      throw new MissingArgumentError('destPath must be a path to a tar.gz file');

    if (!fs.existsSync(sourcePath)) throw new IllegalArgumentError('srcPath does not exists', sourcePath);

    try {
      tar.c(
        {
          gzip: true,
          file: destinationPath,
          sync: true,
        },
        [sourcePath],
      );
      return destinationPath;
    } catch (error: Error | any) {
      throw new SoloError(`failed to tar ${sourcePath}: ${error.message}`, error);
    }
  }

  untar(sourcePath: string, destinationPath: string) {
    if (!sourcePath) throw new MissingArgumentError('srcPath is required');
    if (!destinationPath) throw new MissingArgumentError('destPath is required');

    if (!fs.existsSync(sourcePath)) throw new IllegalArgumentError('srcPath does not exists', sourcePath);
    if (!fs.existsSync(destinationPath)) {
      fs.mkdirSync(destinationPath);
    }

    try {
      tar.x({
        C: destinationPath,
        file: sourcePath,
        sync: true,
      });
      return destinationPath;
    } catch (error: Error | any) {
      throw new SoloError(`failed to untar ${sourcePath}: ${error.message}`, error);
    }
  }
}
