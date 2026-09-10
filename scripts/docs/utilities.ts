// SPDX-License-Identifier: Apache-2.0

import {type ChildProcessByStdio, spawn} from 'node:child_process';
import chalk from 'chalk';
import * as Base64 from 'js-base64';
import {type Readable} from 'node:stream';

/**
 * Run a shell command, preserving colors for interactive Solo CLI commands,
 * otherwise using normal spawn for safety.
 * @returns - The output of the command.
 */
export async function run(cmd: string, options: object = {}): Promise<string> {
  console.log(chalk.green(cmd));

  // Normal spawn for non-interactive commands
  const [command, ...arguments_]: string[] = cmd.split(' ');
  return new Promise((resolve: (value: string) => void, reject: (reason?: Error) => void): void => {
    const environment: Record<string, string> = {...process.env};
    if (!environment.PATH) {
      environment.PATH = '/usr/local/bin:/usr/bin:/bin';
    }

    const child: ChildProcessByStdio<null, Readable, Readable> = spawn(command, arguments_, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
      env: environment,
      ...options,
    });

    let output: string = '';
    child.stdout.on('data', (data): void => {
      const text: string = data.toString();
      process.stdout.write(text);
      output += text.replaceAll('\r', '');
    });
    child.stderr.on('data', (data): void => {
      const text: string = data.toString();
      process.stderr.write(text);
      output += text.replaceAll('\r', '');
    });

    child.on('close', (code): void => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(`run: Command failed: ${cmd} (exit code ${code})`));
      }
    });
  });
}

/**
 * Run a command and capture its stdout as a string.
 * @param cmd - Command to execute (can include arguments)
 * @param options
 * @param returnBase64 - If true, returns the output as a base64-encoded string
 * @returns - Resolves to the stdout output
 */
export async function runCapture(cmd: string, options: object = {}, returnBase64: boolean = false): Promise<string> {
  const SOLO_DEBUG: boolean = process.env.SOLO_DEBUG?.trim().toLowerCase() === 'true';
  return new Promise((resolve: (value: string) => void, reject: (reason?: Error) => void): void => {
    const environment: Record<string, string> = {...process.env};
    if (!environment.PATH) {
      environment.PATH = '/usr/local/bin:/usr/bin:/bin';
    }

    if (SOLO_DEBUG) {
      console.log(chalk.yellow(`begin ... runCapture(): ${cmd}, process.cwd(): ${process.cwd()}`));
    }
    const child: ChildProcessByStdio<null, Readable, Readable> = spawn(cmd, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      cwd: process.cwd(),
      env: environment,
      ...options,
    });

    let output: string = '';

    child.stdout.on('data', (data): void => {
      output += data.toString().replaceAll('\r', '');
    });

    child.stderr.on('data', (data): void => {
      output += data.toString().replaceAll('\r', '');
    });

    child.on('close', (code): void => {
      if (code === 0) {
        const filteredOutput: string = filterOutputNoise(output);
        resolve(returnBase64 ? Base64.encode(filteredOutput) : filteredOutput);
      } else {
        const tail: string = output.trim() ? `\n--- command output ---\n${output.trim()}\n----------------------` : '';
        reject(new Error(`runCapture: Command failed: ${cmd} (exit code ${code})${tail}`));
      }
    });
  });
}

function filterOutputNoise(output: string): string {
  const lines: string[] = output.split('\n').filter((line): boolean => {
    const trimmed: string = line.trim();
    return (
      !trimmed.startsWith('>> environment variable') &&
      !trimmed.startsWith('Warning:') &&
      !trimmed.includes('DeprecationWarning:') &&
      !trimmed.includes('--trace-deprecation')
    );
  });

  // remove any empty lines until the first non-empty line, and any empty lines after the last non-empty line
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines.at(-1).trim() === '') {
    lines.pop();
  }

  return lines.join('\n');
}
