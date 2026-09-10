// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from './utilities.js';
import chalk from 'chalk';
import {update} from './command-output.js';

async function runCommandOutput(): Promise<void> {
  const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot: string = path.resolve(__dirname, '../../');
  process.chdir(projectRoot);

  const version: string = process.argv[2];
  console.log(`VERSION=${version ?? ''}`);

  if (version) {
    await run(`npm version ${version} -f --no-git-tag-version --allow-same-version`);
  }

  console.log(chalk.cyan('ℹ Running task build:compile'));
  // Invoke the `task` binary that the workflow's "Install Task" step (arduino/setup-task) already put on
  // PATH, instead of `npx @go-task/cli`. This script only ever runs inside a `task build:solo:command:output`
  // invocation (see docs/site/Taskfile.yaml), so `task` is guaranteed to be resolvable here. `npx` bypassed
  // that pre-installed binary and made npm resolve, fetch, and postinstall a brand-new copy of `@go-task/cli`
  // (plus its `jszip`/`proxy-agent`/`tar` dependencies) from the registry on every single run, right after the
  // job's own `npm ci` had just finished hammering the runner's npm cache/network path. Any transient registry
  // hiccup during that redundant fetch failed the whole step with a bare "exit code 1" and no diagnostic
  // output, because `run()` only reports the exit code and npx installs run at a suppressed log level, so the
  // underlying npm error never reached the CI log (see #5850 / #5852). Using the pre-installed binary removes
  // the extra network round-trip entirely, eliminating that flake surface.
  await run('task build:compile');

  console.log(chalk.cyan('ℹ Installing and linking @hiero-ledger/solo'));
  await run('npx cross-env SOLO_NO_CACHE=true npm install -g @hiero-ledger/solo');
  await run('npm link');

  await run('which solo');
  await run('solo --version');
  await run("node -p -e 'Boolean(process.stdout.isTTY)'");

  console.log(chalk.cyan('ℹ Running updateDocs'));
  await update();

  // print the generated file
  console.log('::group::Created solo-command-output.json');
  await run(`cat ${path.join(projectRoot, 'docs/site/build/solo-command-output.json')}`);
  console.log('::endgroup::');
}
function main(): void {
  runCommandOutput()
    .then((): void => {
      console.log(chalk.green('✅ Done'));
    })
    .catch((error): void => {
      console.error(chalk.red('❌ Error:'), error);
      // eslint-disable-next-line unicorn/no-process-exit,n/no-process-exit
      process.exit(1);
    });
}
main();
