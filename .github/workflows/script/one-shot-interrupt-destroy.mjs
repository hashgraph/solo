#!/usr/bin/env node

import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULTS = {
  soloCommand: 'npm run solo --',
  deployment: 'one-shot-interrupt',
  interruptSeconds: 120,
  jitterSeconds: 10,
  maxDestroyAttempts: 8,
  destroySleepSeconds: 20,
  destroyTimeoutSeconds: 300,
};

const state = {
  cleanupRunning: false,
  lastCommandOutput: '',
};

function usage() {
  console.log(`Usage:
  one-shot-interrupt-destroy.mjs [options] [seconds]

Options:
  -c, --command CMD        Solo command prefix (default: "npm run solo --")
  -d, --deployment NAME    Deployment name (default: "one-shot-interrupt")
  -j, --jitter SECONDS     Jitter seconds (+/-) (default: 10)
  -r, --retries N          Destroy retry attempts (default: 8)
  -s, --sleep SECONDS      Destroy retry sleep seconds (default: 20)
  -h, --help               Show help

Examples:
  node .github/workflows/script/one-shot-interrupt-destroy.mjs 60
  node .github/workflows/script/one-shot-interrupt-destroy.mjs -d my-deploy -j 15
  SOLO_COMMAND="npx @hiero-ledger/solo" node .github/workflows/script/one-shot-interrupt-destroy.mjs
`);
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function logBanner(title) {
  log('');
  log('============================================================');
  log(title);
  log('============================================================');
}

function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

function parseInteger(name, value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${value}`);
  }
  return parsed;
}

function parseArgs() {
  const parsed = {
    soloCommand: process.env.SOLO_COMMAND || DEFAULTS.soloCommand,
    deployment: process.env.SOLO_DEPLOYMENT || DEFAULTS.deployment,
    interruptSeconds: parseInteger('INTERRUPT_SECONDS', process.env.INTERRUPT_SECONDS || DEFAULTS.interruptSeconds),
    jitterSeconds: parseInteger('JITTER_SECONDS', process.env.JITTER_SECONDS || DEFAULTS.jitterSeconds),
    maxDestroyAttempts: parseInteger(
      'MAX_DESTROY_ATTEMPTS',
      process.env.MAX_DESTROY_ATTEMPTS || DEFAULTS.maxDestroyAttempts,
    ),
    destroySleepSeconds: parseInteger(
      'DESTROY_SLEEP_SECS',
      process.env.DESTROY_SLEEP_SECS || DEFAULTS.destroySleepSeconds,
    ),
    destroyTimeoutSeconds: parseInteger(
      'DESTROY_TIMEOUT_SECS',
      process.env.DESTROY_TIMEOUT_SECS || DEFAULTS.destroyTimeoutSeconds,
    ),
  };

  const positional = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-c':
      case '--command':
        parsed.soloCommand = argv[++i] || '';
        break;
      case '-d':
      case '--deployment':
        parsed.deployment = argv[++i] || '';
        break;
      case '-j':
      case '--jitter':
        parsed.jitterSeconds = parseInteger('jitter', argv[++i]);
        break;
      case '-r':
      case '--retries':
        parsed.maxDestroyAttempts = parseInteger('retries', argv[++i]);
        break;
      case '-s':
      case '--sleep':
        parsed.destroySleepSeconds = parseInteger('sleep', argv[++i]);
        break;
      case '-h':
      case '--help':
        usage();
        process.exit(0);
      default:
        positional.push(arg);
    }
  }

  if (positional.length > 0) {
    parsed.interruptSeconds = parseInteger('interruptSeconds', positional[0]);
  }

  if (parsed.interruptSeconds < 1) {
    throw new Error('INTERRUPT_SECONDS must be >= 1');
  }

  return parsed;
}

async function runCommandWithTimeout(label, timeoutSeconds, command) {
  return new Promise(resolve => {
    const outputChunks = [];
    let timedOut = false;

    const child = spawn(command, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 3000);
    }, timeoutSeconds * 1000);

    const onData = chunk => {
      const text = chunk.toString();
      outputChunks.push(text);
      process.stdout.write(text);
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('close', code => {
      clearTimeout(timer);
      state.lastCommandOutput = outputChunks.join('');
      if (timedOut) {
        log(`${label} timed out after ${timeoutSeconds}s`);
        resolve(124);
        return;
      }
      resolve(code ?? 1);
    });

    child.on('error', error => {
      clearTimeout(timer);
      state.lastCommandOutput = `${state.lastCommandOutput}\n${String(error)}`;
      resolve(1);
    });
  });
}

async function runDestroyWithRetry(config, label) {
  let exitCode = 0;

  for (let attempt = 1; attempt <= config.maxDestroyAttempts; attempt++) {
    log(`Running one-shot destroy (${label}) attempt ${attempt}/${config.maxDestroyAttempts}`);
    const command = `${config.soloCommand} one-shot single destroy --quiet-mode`;
    exitCode = await runCommandWithTimeout('Destroy', config.destroyTimeoutSeconds, command);

    if (/Deployments? name is not found in local config/.test(state.lastCommandOutput)) {
      log('No deployment in local config; nothing to destroy.');
      return 0;
    }

    if (exitCode === 0) {
      return 0;
    }

    log(`Destroy attempt ${attempt} failed (exit ${exitCode}); retrying in ${config.destroySleepSeconds}s`);
    await sleep(config.destroySleepSeconds);
  }

  log(`Destroy failed after ${config.maxDestroyAttempts} attempts.`);
  return exitCode;
}

async function commandExists(command) {
  const code = await runCommandWithTimeout('Check command', 10, `${command} --help`);
  return code === 0;
}

async function deleteCluster() {
  log('Deleting any existing Kind clusters');

  const hasKind = await commandExists('kind').catch(() => false);
  if (hasKind) {
    const listCode = await runCommandWithTimeout('List kind clusters', 20, 'kind get clusters');
    if (listCode === 0) {
      const clusters = state.lastCommandOutput
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

      for (const cluster of clusters) {
        log(`Deleting kind cluster: ${cluster}`);
        await runCommandWithTimeout('Delete kind cluster', 120, `kind delete cluster --name ${cluster}`);
      }
    }
  }

  const soloHome = path.join(os.homedir(), '.solo');
  try {
    const entries = await fs.readdir(soloHome);
    await Promise.all(entries.map(entry => fs.rm(path.join(soloHome, entry), {recursive: true, force: true})));
    log(`Removed ${soloHome}/*`);
  } catch {
    // ignore missing home directory
  }
}

async function runWithInterrupt(config) {
  const jitter = Math.floor(Math.random() * (config.jitterSeconds * 2 + 1)) - config.jitterSeconds;
  let sleepSeconds = config.interruptSeconds + jitter;
  if (sleepSeconds < 1) {
    sleepSeconds = 1;
  }

  const label = (config.interruptSeconds / 60).toFixed(1);
  logBanner(`Testing interrupt interval ${config.interruptSeconds}s (${label}m)`);
  log(`Starting one-shot deploy; interrupt after ${sleepSeconds}s (base ${label}m, jitter ${jitter}s)`);

  await deleteCluster();

  let exitCode = await runCommandWithTimeout(
    'Deploy',
    sleepSeconds,
    `${config.soloCommand} one-shot single deploy --deployment "${config.deployment}" --quiet-mode`,
  );

  if (exitCode !== 0) {
    log(`Deploy exited with ${exitCode} (expected when interrupted).`);
  }

  await runDestroyWithRetry(config, 'post-interrupt');
  log(`Done for ${label}m`);
}

async function handleSignal(config) {
  log('Received interrupt; attempting cleanup.');
  if (state.cleanupRunning) {
    process.exit(130);
  }

  state.cleanupRunning = true;
  try {
    await runDestroyWithRetry(config, 'signal');
  } catch {
    // ignore cleanup failures on signal path
  }
  process.exit(130);
}

async function main() {
  const config = parseArgs();

  process.on('SIGINT', () => {
    void handleSignal(config);
  });
  process.on('SIGTERM', () => {
    void handleSignal(config);
  });

  await runWithInterrupt(config);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
