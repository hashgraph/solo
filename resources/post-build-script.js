// SPDX-License-Identifier: Apache-2.0

'use strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

//! Target directory
const distDir = path.resolve(__dirname, '../dist');
const srcPackageJsonFilePath = path.resolve(__dirname, '../package.json');
const targetPackageJsonFilePath = path.join(distDir, 'package.json');
const srcResourcesDir = path.join(__dirname, '../resources');
const targetResourcesDir = path.join(distDir, 'resources');

function copyPackageJson(srcPackageJsonFilePath, targetPackageJsonFilePath) {
  fs.copyFileSync(srcPackageJsonFilePath, targetPackageJsonFilePath);
}

function copyResources(srcDir, targetDir) {
  fs.cpSync(srcDir, targetDir, {recursive: true});
}

async function recursiveChmod(dir, mode) {
  const files = await fs.promises.readdir(dir);
  for (const file of files) {
    const filePath = `${dir}/${file}`;
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      await recursiveChmod(filePath, mode);
    } else {
      await fs.promises.chmod(filePath, mode);
    }
  }
}

// Usage
console.time('Copy package.json');
copyPackageJson(srcPackageJsonFilePath, targetPackageJsonFilePath);
console.time('Copy resources');
copyResources(srcResourcesDir, targetResourcesDir);
console.time('Update permissions');
await recursiveChmod(distDir, 0o755);
