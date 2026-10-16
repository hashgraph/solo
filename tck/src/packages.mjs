// SPDX-License-Identifier: Apache-2.0
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Failure, PACKAGES} from './contract.mjs';
import {command} from './process.mjs';

export const integrity = file => `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`;

export async function packSolo(checkout, destination, runtime) {
  // npm 10 can run prepare even with ignore-scripts, polluting --json output.
  await command('npm', ['pack', '--ignore-scripts', '--pack-destination', destination], {...runtime, cwd: checkout});
  const files = readdirSync(destination).filter(filename => filename.endsWith('.tgz'));
  if (files.length !== 1)
    throw new Failure('kit', 'Solo pack must produce exactly one tarball in its fresh destination');
  return path.join(destination, files[0]);
}

export async function candidates(directory, runtime) {
  const packages = {};
  try {
    for (const filename of readdirSync(directory).filter(file => file.endsWith('.tgz'))) {
      const file = realpathSync(path.resolve(directory, filename));
      const metadata = JSON.parse(await command('tar', ['-xOf', file, 'package/package.json'], runtime));
      if (!PACKAGES.includes(metadata.name)) throw new Error(`Unexpected package ${metadata.name}`);
      if (packages[metadata.name]) throw new Error(`Multiple tarballs for ${metadata.name}`);
      if (!/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(metadata.version))
        throw new Error(`Invalid version for ${metadata.name}`);
      packages[metadata.name] = {file, version: metadata.version, integrity: integrity(file)};
    }
    for (const name of PACKAGES) if (!packages[name]) throw new Error(`Missing tarball for ${name}`);
  } catch (error) {
    throw new Failure('invalid', `Invalid candidate-packages: ${error.message}`, {cause: error});
  }
  return packages;
}

export async function install(directory, solo, packages, runtime) {
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify(
      {
        private: true,
        dependencies: {'@hiero-ledger/solo': solo},
        overrides: Object.fromEntries(Object.entries(packages).map(([name, value]) => [name, `file:${value.file}`])),
      },
      null,
      2,
    ),
  );
  await command('npm', ['install', '--no-audit', '--no-fund'], {...runtime, cwd: directory});
}

function packageRoot(file, name) {
  for (let directory = path.dirname(file); directory !== path.dirname(directory); directory = path.dirname(directory)) {
    const metadata = path.join(directory, 'package.json');
    try {
      if (JSON.parse(readFileSync(metadata, 'utf8')).name === name) return realpathSync(directory);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Failure('candidate', `No ${name} package root for ${file}`);
}

export async function identity(directory, packages, runtime) {
  const lock = JSON.parse(readFileSync(path.join(directory, 'package-lock.json'), 'utf8'));
  const evidence = [];
  for (const [name, candidate] of Object.entries(packages)) {
    const copies = Object.entries(lock.packages).filter(([key]) => key.endsWith(`node_modules/${name}`));
    if (copies.length !== 1 || copies[0][1].integrity !== candidate.integrity) {
      throw new Failure(
        'candidate',
        `Solo must contain exactly one copy of the ${name} candidate tarball (${candidate.integrity}).`,
      );
    }
    evidence.push({name, version: copies[0][1].version, integrity: copies[0][1].integrity, location: copies[0][0]});
  }
  const solo = path.join(directory, 'node_modules/@hiero-ledger/solo');
  const required = createRequire(path.join(solo, 'package.json')).resolve('@hiero-ledger/sdk');
  const imported = fileURLToPath(
    (
      await command(
        process.execPath,
        ['--input-type=module', '--eval', 'console.log(import.meta.resolve("@hiero-ledger/sdk"))'],
        {...runtime, cwd: solo},
      )
    ).trim(),
  );
  const expected = realpathSync(path.join(directory, 'node_modules/@hiero-ledger/sdk'));
  for (const file of [required, imported]) {
    if (packageRoot(file, '@hiero-ledger/sdk') !== expected)
      throw new Failure('candidate', `Solo resolves the wrong SDK: ${file}`);
  }
  return {
    packages: evidence,
    required,
    imported,
    soloVersion: JSON.parse(readFileSync(path.join(solo, 'package.json'), 'utf8')).version,
  };
}
