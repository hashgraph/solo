// SPDX-License-Identifier: Apache-2.0

import {SoloError, IllegalArgumentError, MissingArgumentError} from './errors.js';
import fs from 'fs';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import chalk from 'chalk';
import path from 'path';
import {type SoloLogger} from './logging.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency_injection/container_helper.js';
import {InjectTokens} from './dependency_injection/inject_tokens.js';

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
  async zip(srcPath: string, destPath: string, verbose = false) {
    if (!srcPath) throw new MissingArgumentError('srcPath is required');
    if (!destPath) throw new MissingArgumentError('destPath is required');
    if (!destPath.endsWith('.zip')) throw new MissingArgumentError('destPath must be a path to a zip file');

    try {
      const zip = new AdmZip('', {});

      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        zip.addLocalFolder(srcPath, '');
      } else {
        zip.addFile(path.basename(srcPath), fs.readFileSync(srcPath), '', stat as any);
      }

      await zip.writeZipPromise(destPath, {overwrite: true});

      return destPath;
    } catch (e: Error | any) {
      throw new SoloError(`failed to unzip ${srcPath}: ${e.message}`, e);
    }
  }

  unzip(srcPath: string, destPath: string, verbose = false) {
    const self = this;

    if (!srcPath) throw new MissingArgumentError('srcPath is required');
    if (!destPath) throw new MissingArgumentError('destPath is required');

    if (!fs.existsSync(srcPath)) throw new IllegalArgumentError('srcPath does not exists', srcPath);

    try {
      const zip = new AdmZip(srcPath, {readEntries: true});

      zip.getEntries().forEach(zipEntry => {
        if (verbose) {
          self.logger.debug(`Extracting file: ${zipEntry.entryName} -> ${destPath}/${zipEntry.entryName} ...`, {
            src: zipEntry.entryName,
            dst: `${destPath}/${zipEntry.entryName}`,
          });
        }

        zip.extractEntryTo(zipEntry, destPath, true, true, true, zipEntry.entryName);
        if (verbose) {
          self.logger.showUser(
            chalk.green('OK'),
            `Extracted: ${zipEntry.entryName} -> ${destPath}/${zipEntry.entryName}`,
          );
        }
      });

      return destPath;
    } catch (e: Error | any) {
      throw new SoloError(`failed to unzip ${srcPath}: ${e.message}`, e);
    }
  }

  tar(srcPath: string, destPath: string) {
    if (!srcPath) throw new MissingArgumentError('srcPath is required');
    if (!destPath) throw new MissingArgumentError('destPath is required');
    if (!destPath.endsWith('.tar.gz')) throw new MissingArgumentError('destPath must be a path to a tar.gz file');

    if (!fs.existsSync(srcPath)) throw new IllegalArgumentError('srcPath does not exists', srcPath);

    try {
      tar.c(
        {
          gzip: true,
          file: destPath,
          sync: true,
        },
        [srcPath],
      );
      return destPath;
    } catch (e: Error | any) {
      throw new SoloError(`failed to tar ${srcPath}: ${e.message}`, e);
    }
  }

  untar(srcPath: string, destPath: string) {
    if (!srcPath) throw new MissingArgumentError('srcPath is required');
    if (!destPath) throw new MissingArgumentError('destPath is required');

    if (!fs.existsSync(srcPath)) throw new IllegalArgumentError('srcPath does not exists', srcPath);
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath);
    }

    try {
      tar.x({
        C: destPath,
        file: srcPath,
        sync: true,
      });
      return destPath;
    } catch (e: Error | any) {
      throw new SoloError(`failed to untar ${srcPath}: ${e.message}`, e);
    }
  }
}
