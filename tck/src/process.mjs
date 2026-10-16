// SPDX-License-Identifier: Apache-2.0
import {spawn} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {Failure, redact} from './contract.mjs';

export function stop(child, signal = 'SIGTERM', group = true) {
  try {
    process.kill(group ? -child.pid : child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

export async function command(
  program,
  arguments_,
  {cwd, env, timeout = 30_000, deadline = Infinity, signal, log, secret = false, group = true} = {},
) {
  signal?.throwIfAborted();
  timeout = Math.min(timeout, deadline - Date.now());
  if (timeout <= 0) throw new Failure('unknown', `${program} stage deadline exhausted`);
  return new Promise((resolve, reject) => {
    const child = spawn(program, arguments_, {
      cwd,
      env,
      shell: false,
      detached: group,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let failure;
    let killTimer;
    const cancel = message => {
      failure ||= new Failure('unknown', message);
      stop(child, 'SIGTERM', group);
      killTimer ||= setTimeout(() => stop(child, 'SIGKILL', group), 2000);
    };
    const abort = () => cancel(String(signal.reason || 'Run cancelled'));
    const timer = setTimeout(() => cancel(`${program} exceeded its ${timeout}ms deadline`), timeout);
    signal?.addEventListener('abort', abort, {once: true});
    child.stdout.on('data', data => {
      stdout += data;
      if (stdout.length > 4_000_000) cancel(`${program} exceeded its output limit`);
    });
    child.stderr.on('data', data => {
      stderr += data;
      if (stderr.length > 4_000_000) cancel(`${program} exceeded its output limit`);
    });
    child.once('error', error => {
      failure = error;
    });
    child.once('close', (code, termination) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
      if (log)
        appendFileSync(
          log,
          secret ? `${program}: output withheld (test account keys)\n` : redact(`${stdout}\n${stderr}\n`),
        );
      if (failure || code !== 0) {
        const error =
          failure ||
          new Failure(
            'unknown',
            `${program} exited ${code ?? termination}: ${secret ? '(test account output withheld)' : redact(stderr || stdout).slice(-2400)}`,
          );
        error.output = secret ? '(test account output withheld)' : redact(`${stdout}\n${stderr}`);
        reject(error);
      } else resolve(stdout);
    });
  });
}
