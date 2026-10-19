// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from './errors/solo-errors.js';
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import chalk from 'chalk';
import path from 'node:path';
import {type SoloLogger} from './logging/solo-logger.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';

@injectable()
export class Zippy {
  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  /**
   * Zip a file or directory
   * @returns path to the output zip file
   * @param sourcePath
   * @param destinationPath
   */
  public async zip(sourcePath: string, destinationPath: string): Promise<string> {
    if (!sourcePath) {
      throw new SoloErrors.validation.missingArgument('srcPath is required');
    }
    if (!destinationPath) {
      throw new SoloErrors.validation.missingArgument('destPath is required');
    }
    if (!destinationPath.endsWith('.zip')) {
      throw new SoloErrors.validation.missingArgument('destPath must be a path to a zip file');
    }

    try {
      const zip: AdmZip = new AdmZip('', {});

      // Opened once and inspected through the descriptor: stat-then-read would let the path be swapped
      // between the two calls, so the file described by the stat need not be the file that is read.
      const sourceHandle: number = fs.openSync(sourcePath, 'r');
      try {
        const stat: fs.Stats = fs.fstatSync(sourceHandle);
        if (stat.isDirectory()) {
          zip.addLocalFolder(sourcePath, '');
        } else {
          zip.addFile(path.basename(sourcePath), fs.readFileSync(sourceHandle), '', stat);
        }
      } finally {
        fs.closeSync(sourceHandle);
      }

      await zip.writeZipPromise(destinationPath, {overwrite: true});

      return destinationPath;
    } catch (error) {
      throw new SoloErrors.system.archiveUnzipFailed(sourcePath, error);
    }
  }

  public unzip(sourcePath: string, destinationPath: string, verbose: boolean = false): string {
    if (!sourcePath) {
      throw new SoloErrors.validation.missingArgument('srcPath is required');
    }
    if (!destinationPath) {
      throw new SoloErrors.validation.missingArgument('destPath is required');
    }

    if (!fs.existsSync(sourcePath)) {
      throw new SoloErrors.validation.illegalArgument('srcPath does not exists', sourcePath);
    }

    try {
      const zip: AdmZip = new AdmZip(sourcePath, {readEntries: true});

      for (const zipEntry of zip.getEntries()) {
        if (verbose) {
          this.logger.debug(`Extracting file: ${zipEntry.entryName} -> ${destinationPath}/${zipEntry.entryName} ...`, {
            src: zipEntry.entryName,
            dst: `${destinationPath}/${zipEntry.entryName}`,
          });
        }

        zip.extractEntryTo(zipEntry, destinationPath, true, true, true, zipEntry.entryName);
        if (verbose) {
          this.logger.showUser(
            chalk.green('OK'),
            `Extracted: ${zipEntry.entryName} -> ${destinationPath}/${zipEntry.entryName}`,
          );
        }
      }

      return destinationPath;
    } catch (error) {
      throw new SoloErrors.system.archiveUnzipFailed(sourcePath, error);
    }
  }

  public tar(sourcePath: string, destinationPath: string): string {
    if (!sourcePath) {
      throw new SoloErrors.validation.missingArgument('srcPath is required');
    }
    if (!destinationPath) {
      throw new SoloErrors.validation.missingArgument('destPath is required');
    }
    if (!destinationPath.endsWith('.tar.gz')) {
      throw new SoloErrors.validation.missingArgument('destPath must be a path to a tar.gz file');
    }

    if (!fs.existsSync(sourcePath)) {
      throw new SoloErrors.validation.illegalArgument('srcPath does not exists', sourcePath);
    }

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
    } catch (error) {
      throw new SoloErrors.system.archiveTarFailed(sourcePath, error);
    }
  }

  public untar(sourcePath: string, destinationPath: string): string {
    if (!sourcePath) {
      throw new SoloErrors.validation.missingArgument('srcPath is required');
    }
    if (!destinationPath) {
      throw new SoloErrors.validation.missingArgument('destPath is required');
    }

    if (!fs.existsSync(sourcePath)) {
      throw new SoloErrors.validation.illegalArgument('srcPath does not exists', sourcePath);
    }
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
    } catch (error) {
      throw new SoloErrors.system.archiveUntarFailed(sourcePath, error);
    }
  }
}
