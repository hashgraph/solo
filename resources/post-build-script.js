/**
 * Copyright (C) 2025 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
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
