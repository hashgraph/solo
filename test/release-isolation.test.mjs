// SPDX-License-Identifier: Apache-2.0

// Install the release workflow's toolchain in a temporary directory, then run the tests:
// npm install --prefix <directory> --ignore-scripts --no-audit --no-fund \
//   semantic-release@25.0.2 conventional-changelog-conventionalcommits@9.1.0
// SOLO_RELEASE_TEST_TOOLS=<directory> node --test test/release-isolation.test.mjs

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {devNull, tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const toolchain = process.env.SOLO_RELEASE_TEST_TOOLS;
assert.ok(toolchain, 'Set SOLO_RELEASE_TEST_TOOLS to the temporary release-toolchain installation directory.');
const toolchainRequire = createRequire(path.join(path.resolve(toolchain), 'package.json'));
const releaseRequire = createRequire(toolchainRequire.resolve('semantic-release'));
const {analyzeCommits} = await import(pathToFileURL(releaseRequire.resolve('@semantic-release/commit-analyzer')));
const configuration = JSON.parse(readFileSync(path.join(root, '.releaserc'), 'utf8'));
const analyzerOptions = configuration.plugins.find(plugin => plugin[0] === '@semantic-release/commit-analyzer')[1];
const skill = readFileSync(path.join(root, '.claude/skills/solo-prepare-release/SKILL.md'), 'utf8');

for (const [name, messages, expected] of [
  ['TCK feature', ['feat(tck): add an SDK lane'], null],
  ['TCK fix', ['fix(tck): collect diagnostics'], null],
  ['TCK breaking header', ['feat(tck)!: change the caller inputs'], null],
  ['TCK breaking footer', ['fix(tck): change the result\n\nBREAKING CHANGE: new result schema'], null],
  ['Solo feature', ['feat: add a command'], 'minor'],
  ['Solo fix', ['fix: repair a command'], 'patch'],
  ['Solo performance change', ['perf(cli): speed up a command'], 'patch'],
  ['Solo documentation', ['docs: explain a command'], null],
  ['unscoped Solo breaking header', ['fix!: change the CLI'], 'minor'],
  ['unscoped Solo breaking footer', ['fix: change output\n\nBREAKING CHANGE: new output'], 'minor'],
  ['Solo breaking header', ['fix(cli)!: change the CLI'], 'minor'],
  ['Solo breaking footer', ['fix(cli): change output\n\nBREAKING CHANGE: new output'], 'minor'],
  ['distinct scope', ['feat(tck-tools): change Solo tooling'], 'minor'],
  ['TCK feature plus Solo fix', ['feat(tck): add a lane', 'fix(cli): repair a command'], 'patch'],
  ['TCK breaking change plus Solo fix', ['feat(tck)!: change inputs', 'fix(cli): repair a command'], 'patch'],
  ['TCK change plus Solo feature', ['fix(tck): repair a probe', 'feat(cli): add a command'], 'minor'],
]) {
  test(`semantic-release: ${name}`, async () => {
    const actual = await analyzeCommits(analyzerOptions, {
      cwd: toolchain,
      commits: messages.map((message, index) => ({message, hash: String(index)})),
      logger: {log() {}},
    });
    assert.equal(actual, expected);
  });
}

function fixture(context) {
  const directory = mkdtempSync(path.join(tmpdir(), 'solo-release-isolation-'));
  context.after(() => rmSync(directory, {recursive: true, force: true}));
  return directory;
}

function run(command, arguments_, cwd) {
  return execFileSync(command, arguments_, {
    cwd,
    shell: false,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Release Isolation Test',
      GIT_AUTHOR_EMAIL: 'release-test@example.com',
      GIT_COMMITTER_NAME: 'Release Isolation Test',
      GIT_COMMITTER_EMAIL: 'release-test@example.com',
    },
  });
}

function git(cwd, ...arguments_) {
  return run(
    'git',
    ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'init.defaultBranch=main', ...arguments_],
    cwd,
  );
}

function history(context, subjects) {
  const directory = fixture(context);
  git(directory, 'init', '--quiet');
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify({name: 'solo-release-test', version: '0.93.0'}));
  git(directory, 'add', 'package.json');
  git(directory, 'commit', '--quiet', '-m', 'chore: initial release');
  git(directory, 'tag', '-a', 'v0.93.0', '-m', 'Solo release');
  for (const subject of subjects) git(directory, 'commit', '--quiet', '--allow-empty', '-m', subject);
  git(directory, 'tag', '-a', 'tck-v9.0.0', '-m', 'Newer kit release');
  return directory;
}

test('every release-skill tag lookup ignores a newer annotated TCK tag', context => {
  const directory = history(context, ['feat(tck): add a lane']);
  const lookups = skill.match(/git describe[^`)\n]+/g);
  assert.ok(lookups.length >= 3);
  for (const lookup of lookups)
    assert.equal(run('bash', ['-eu', '-o', 'pipefail', '-c', lookup], directory).trim(), 'v0.93.0');
});

for (const [name, subjects, expected] of [
  ['TCK-only features', ['feat(tck): add a lane'], 'No Solo commits'],
  ['TCK-only breaking changes', ['feat(tck)!: change inputs'], 'No Solo commits'],
  ['TCK features and a Solo fix', ['feat(tck): add a lane', 'fix(cli): repair a command'], 'Next version: 0.93.1'],
  [
    'a Solo feature before the TCK tag',
    ['feat(cli): add a command', 'fix(tck): repair a probe'],
    'Next version: 0.94.0',
  ],
  ['a distinct scope', ['feat(tck-tools): change Solo tooling'], 'Next version: 0.94.0'],
]) {
  test(`release-skill calculation: ${name}`, context => {
    const directory = history(context, subjects);
    const blocks = [...skill.matchAll(/```bash\n([\s\S]*?)\n```/g)].map(match => match[1]);
    const setup = blocks.find(block => block.startsWith('LAST_TAG='));
    const calculation = blocks.find(block => block.startsWith('CUR='));
    assert.ok(setup && calculation, 'Run the actual tag lookup and version calculation from the skill.');
    assert.ok(run('bash', ['-eu', '-o', 'pipefail', '-c', `${setup}\n${calculation}`], directory).includes(expected));
  });
}

test('npm pack excludes the kit and retains Solo CLI and resources', context => {
  const directory = fixture(context);
  const project = path.join(directory, 'package');
  for (const folder of ['dist', 'resources', 'tck/lib', 'tck/specs', 'tck/node_modules/example']) {
    mkdirSync(path.join(project, folder), {recursive: true});
  }
  copyFileSync(path.join(root, '.npmignore'), path.join(project, '.npmignore'));
  copyFileSync(path.join(root, 'package.json'), path.join(project, 'package.json'));
  for (const file of [
    'dist/solo.js',
    'resources/solo.yaml',
    'tck/action.yml',
    'tck/lib/run.js',
    'tck/specs/js-sdk.md',
    'tck/node_modules/example/index.js',
  ]) {
    writeFileSync(path.join(project, file), 'release isolation fixture\n');
  }
  writeFileSync(path.join(project, 'tck/.npmignore'), '!action.yml\n');
  const [packed] = JSON.parse(
    run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], project),
  );
  const files = packed.files.map(file => file.path);
  assert.ok(
    !files.some(file => file.startsWith('tck/')),
    `Kit leaked into the tarball: ${files.filter(file => file.startsWith('tck/'))}`,
  );
  for (const file of ['package.json', 'dist/solo.js', 'resources/solo.yaml']) assert.ok(files.includes(file), file);
});
