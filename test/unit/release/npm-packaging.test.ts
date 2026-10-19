// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {spawnSync, type SpawnSyncReturns} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

interface NpmPackFileEntry {
  path: string;
  size: number;
  mode: number;
}

interface NpmPackResult {
  id: string;
  name: string;
  version: string;
  files: NpmPackFileEntry[];
  entryCount: number;
}

describe('NPM Packaging Isolation (Issue #6234)', (): void => {
  const currentFileName: string = fileURLToPath(import.meta.url);
  const rootDirectory: string = path.resolve(path.dirname(currentFileName), '../../../');
  const tckDirectoryPath: string = path.join(rootDirectory, 'tck');
  let createdTckDirectory: boolean = false;

  beforeEach((): void => {
    // Ensure tck/ directory exists with mock files to verify exclusion
    if (!fs.existsSync(tckDirectoryPath)) {
      fs.mkdirSync(tckDirectoryPath, {recursive: true});
      fs.writeFileSync(path.join(tckDirectoryPath, 'README.md'), '# Mock TCK README');
      fs.mkdirSync(path.join(tckDirectoryPath, 'src'), {recursive: true});
      fs.writeFileSync(path.join(tckDirectoryPath, 'src', 'mock-test-lane.mjs'), '// mock test');
      createdTckDirectory = true;
    }
  });

  afterEach((): void => {
    // Clean up temporary tck files created for this test
    if (createdTckDirectory && fs.existsSync(tckDirectoryPath)) {
      fs.rmSync(tckDirectoryPath, {recursive: true, force: true});
      createdTckDirectory = false;
    }
  });

  function getPackedFileList(): string[] {
    const isWindows: boolean = process.platform === 'win32';
    const executable: string = isWindows ? 'cmd.exe' : 'npm';
    const argumentsList: string[] = isWindows
      ? ['/d', '/s', '/c', 'npm', 'pack', '--dry-run', '--json']
      : ['pack', '--dry-run', '--json'];

    const result: SpawnSyncReturns<string> = spawnSync(executable, argumentsList, {
      cwd: rootDirectory,
      encoding: 'utf8',
      shell: false,
    });

    expect(result.status, `npm pack failed with error: ${result.stderr}`).to.equal(0);

    const jsonStartIndex: number = result.stdout.indexOf('[');
    const jsonEndIndex: number = result.stdout.lastIndexOf(']');
    expect(jsonStartIndex).to.be.at.least(0);
    expect(jsonEndIndex).to.be.at.least(jsonStartIndex);

    const rawJson: string = result.stdout.slice(jsonStartIndex, jsonEndIndex + 1);
    const packResults: NpmPackResult[] = JSON.parse(rawJson) as NpmPackResult[];
    expect(packResults).to.be.an('array').with.lengthOf.at.least(1);

    return packResults[0].files.map((fileEntry: NpmPackFileEntry): string => fileEntry.path);
  }

  it('19. The npm tarball does not contain the tck/ directory or its files', (): void => {
    const packedFiles: string[] = getPackedFileList();
    const tckFiles: string[] = packedFiles.filter((filePath: string): boolean => {
      const normalizedPath: string = filePath.replaceAll('\\', '/');
      return normalizedPath.startsWith('tck/') || normalizedPath === 'tck';
    });

    expect(tckFiles).to.be.empty;
  });

  it('20. Required CLI files remain included in the npm package', (): void => {
    const packedFiles: string[] = getPackedFileList();

    expect(packedFiles).to.include('package.json');
    expect(packedFiles).to.include('README.md');
    expect(packedFiles).to.include('LICENSE');
    expect(packedFiles).to.include('solo.ts');
  });

  it('21. Required runtime resources remain included in the npm package', (): void => {
    const packedFiles: string[] = getPackedFileList();
    const resourceFiles: string[] = packedFiles.filter((filePath: string): boolean => {
      return filePath.replaceAll('\\', '/').startsWith('resources/');
    });

    expect(resourceFiles.length).to.be.greaterThan(0);
  });

  it('22. The packaging regression test is repeatable and clean', (): void => {
    const firstRunFiles: string[] = getPackedFileList();
    const secondRunFiles: string[] = getPackedFileList();

    expect(firstRunFiles.length).to.equal(secondRunFiles.length);
    expect(firstRunFiles.filter((filePath: string): boolean => filePath.startsWith('tck'))).to.be.empty;
    expect(secondRunFiles.filter((filePath: string): boolean => filePath.startsWith('tck'))).to.be.empty;
  });
}).timeout(60_000);
