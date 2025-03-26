// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import path from 'path';

export function main() {
  const cwd = process.cwd();
  const nycModulePath = path.join(cwd, 'node_modules', 'nyc', 'bin');
  if (!fs.existsSync(nycModulePath)) {
    fs.mkdirSync(nycModulePath, {recursive: true});
  }

  const c8SourcePath = path.join(cwd, 'node_modules', 'c8', 'bin', 'c8.js');
  if (!fs.existsSync(c8SourcePath)) {
    throw new Error('c8 is not installed, unable to bridge to nyc');
  }

  const nycLinkPath = path.join(nycModulePath, 'nyc.js');
  if (fs.existsSync(nycLinkPath)) {
    fs.rmSync(nycLinkPath);
  }

  fs.symlinkSync(c8SourcePath, nycLinkPath, 'file');
}

main();
