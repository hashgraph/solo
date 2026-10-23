#!/usr/bin/env node

import {appendFileSync, mkdtempSync, writeFileSync} from 'node:fs';
import {randomInt} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

const args = process.argv.slice(2);

let logFile = process.env.LOG_FILE ?? '';
let mode = 'select';
let iterations = 1;
let killedPortFile = process.env.KILLED_PORT_FILE ?? '';

const usage = () => {
  console.log(`Usage:
  select-random-port-forward.mjs [--select|--kill] [--iterations N] [--log-file PATH] [--killed-port-file PATH]

Options:
  --select            Select a random port-forward target (default)
  --kill              Select and kill all kubectl port-forward pids on the selected local port
  --iterations N      Repeat selection N times (selection-only mode)
  --log-file PATH     Append logs to a file
  --killed-port-file  File to write the selected/killed local port (default: in a new temporary directory)
  -h, --help          Show this help

Output variables:
  SELECTED_PORT=<port>
  TARGET_PIDS=<space-separated-pids>`);
};

const log = (message) => {
  const line = `${new Date().toISOString().replace('T', ' ').slice(0, 19)} [port-forward-random] ${message}`;
  console.log(line);
  if (logFile) {
    appendFileSync(logFile, `${line}\n`, 'utf8');
  }
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--select') {
    mode = 'select';
    continue;
  }
  if (arg === '--kill') {
    mode = 'kill';
    continue;
  }
  if (arg === '--iterations') {
    iterations = Number.parseInt(args[i + 1] ?? '', 10);
    i += 1;
    continue;
  }
  if (arg === '--log-file') {
    logFile = args[i + 1] ?? '';
    i += 1;
    continue;
  }
  if (arg === '--killed-port-file') {
    killedPortFile = args[i + 1] ?? killedPortFile;
    i += 1;
    continue;
  }
  if (arg === '--help' || arg === '-h') {
    usage();
    process.exit(0);
  }
  console.error(`Unknown argument: ${arg}`);
  usage();
  process.exit(1);
}

if (!Number.isInteger(iterations) || iterations < 1) {
  console.error(`Invalid --iterations value: ${iterations}`);
  process.exit(1);
}

if (mode === 'kill' && iterations !== 1) {
  console.error('--kill mode supports only --iterations 1');
  process.exit(1);
}

const parsePort = (command) => {
  const match = command.match(/(?:^|\s)(\d{1,5}):\d{1,5}(?:\s|$)/);
  if (!match) {
    return '';
  }
  const port = Number.parseInt(match[1], 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return '';
  }
  return String(port);
};

const getProcessList = () => {
  if (process.platform === 'win32') {
    const cmd = 'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress';
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], {encoding: 'utf8'}).trim();
    if (!out) {
      return [];
    }
    const parsed = JSON.parse(out);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .filter((entry) => entry && entry.CommandLine)
      .map((entry) => ({pid: Number(entry.ProcessId), command: String(entry.CommandLine)}));
  }

  const out = execFileSync('ps', ['-ax', '-o', 'pid=', '-o', 'command='], {encoding: 'utf8'});
  return out
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map(([, pid, command]) => ({pid: Number(pid), command}));
};

const kubectlPortForwardProcesses = () =>
  getProcessList().filter((proc) => /kubectl/.test(proc.command) && /port-forward/.test(proc.command));

const uniquePorts = () => {
  const ports = new Set();
  for (const proc of kubectlPortForwardProcesses()) {
    const port = parsePort(proc.command);
    if (port) {
      ports.add(port);
    }
  }
  return [...ports];
};

const pidsForPort = (port) =>
  kubectlPortForwardProcesses()
    .filter((proc) => parsePort(proc.command) === port)
    .map((proc) => proc.pid);

const selectTarget = () => {
  const ports = uniquePorts();
  if (ports.length === 0) {
    throw new Error('No kubectl port-forward process found');
  }

  const index = randomInt(ports.length);
  const selectedPort = ports[index];
  const pids = pidsForPort(selectedPort);
  if (pids.length === 0) {
    throw new Error(`No matching PID found for selected port ${selectedPort}`);
  }

  log(`Available local ports: ${ports.join(' ')}`);
  log(`Random index=${index}, selected port=${selectedPort}`);
  return {selectedPort, pids};
};

const killPid = (pid) => {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {stdio: 'ignore'});
    } catch {
      // Ignore already-exited processes.
    }
    return;
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Ignore already-exited processes.
  }
};

const killTarget = (port, pids) => {
  log(`Killing PIDs for port ${port}: ${pids.join(' ')}`);
  for (const pid of pids) {
    killPid(pid);
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);

  const remaining = pidsForPort(port);
  if (remaining.length > 0) {
    throw new Error(`Remaining PID(s) still running for port ${port}: ${remaining.join(' ')}`);
  }

  // a private temporary directory, so another user cannot plant the file in the shared temp dir first
  const portFile = killedPortFile || join(mkdtempSync(join(tmpdir(), 'port-forward-')), 'killed_port.txt');
  writeFileSync(portFile, `${port}\n`, 'utf8');
  log(`Killed successfully; wrote selected port ${port} to ${portFile}`);
};

try {
  if (mode === 'select') {
    for (let i = 1; i <= iterations; i += 1) {
      log(`Selection iteration ${i}/${iterations}`);
      const {selectedPort, pids} = selectTarget();
      console.log(`SELECTED_PORT=${selectedPort}`);
      console.log(`TARGET_PIDS=${pids.join(' ')}`);
    }
    process.exit(0);
  }

  const {selectedPort, pids} = selectTarget();
  console.log(`SELECTED_PORT=${selectedPort}`);
  console.log(`TARGET_PIDS=${pids.join(' ')}`);
  killTarget(selectedPort, pids);
} catch (error) {
  log(`ERROR: ${error.message}`);
  process.exit(1);
}
