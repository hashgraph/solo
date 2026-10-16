// SPDX-License-Identifier: Apache-2.0
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {Failure} from './contract.mjs';
import {command, stop} from './process.mjs';

// kubectl emits adjacent, pretty-printed watch objects, not newline-delimited JSON.
export function jsonObjects(onObject) {
  let buffer = '';
  let depth = 0;
  let quoted = false;
  let escaped = false;
  return chunk => {
    for (const character of String(chunk)) {
      if (!buffer && /\s/.test(character)) continue;
      buffer += character;
      if (buffer.length > 4_000_000) throw new Failure('kit', 'Pod watch object exceeds 4MB');
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === '{' || character === '[') depth++;
      else if (character === '}' || character === ']') {
        depth--;
        if (!depth) {
          onObject(JSON.parse(buffer));
          buffer = '';
        }
      }
    }
  };
}

export class PodState {
  pods = new Map();
  baseline;
  pullFailures = new Map();

  observe(event, now = Date.now()) {
    const pod = event.object || event;
    if (pod.kind === 'Status') throw new Failure('unknown', `Pod watch: ${pod.message}`);
    if (pod.items) {
      for (const item of pod.items) this.observe(item, now);
      return;
    }
    const name = pod.metadata?.name;
    if (!name) throw new Failure('kit', 'Pod watch returned an object without metadata');
    if (event.type === 'DELETED') {
      this.pods.delete(name);
      if (this.baseline?.has(name)) throw new Failure('unknown', `Pod ${name} was replaced after deployment`);
      return;
    }
    const containers = [...(pod.status?.initContainerStatuses || []), ...(pod.status?.containerStatuses || [])];
    for (const container of containers) {
      const key = `${pod.metadata.uid}/${container.name}`;
      const waiting = container.state?.waiting?.reason;
      if ([container.state?.terminated?.reason, container.lastState?.terminated?.reason].includes('OOMKilled')) {
        throw new Failure('unknown', `OOMKilled: ${name}/${container.name}`);
      }
      if (['ErrImageNeverPull', 'InvalidImageName'].includes(waiting))
        throw new Failure('environment', `${waiting}: ${name}/${container.name}`);
      if (container.restartCount >= 2 && waiting === 'CrashLoopBackOff')
        throw new Failure('unknown', `Crash loop: ${name}/${container.name}`);
      if (['ImagePullBackOff', 'ErrImagePull'].includes(waiting)) {
        if (!this.pullFailures.has(key)) this.pullFailures.set(key, now);
        if (now - this.pullFailures.get(key) >= 300_000)
          throw new Failure('environment', `Image pull failed for five minutes: ${name}/${container.name}`);
      } else this.pullFailures.delete(key);
      const baseline = this.baseline?.get(name);
      if (
        baseline &&
        (baseline.uid !== pod.metadata.uid || container.restartCount > (baseline.restarts[container.name] ?? 0))
      ) {
        throw new Failure('unknown', `Container restarted after deployment: ${name}/${container.name}`);
      }
    }
    this.pods.set(name, {
      name,
      uid: pod.metadata.uid,
      phase: pod.status?.phase,
      ready:
        pod.status?.phase === 'Succeeded' ||
        pod.status?.conditions?.some(condition => condition.type === 'Ready' && condition.status === 'True'),
      restarts: Object.fromEntries(containers.map(container => [container.name, container.restartCount])),
      containers: [...(pod.spec?.initContainers || []), ...(pod.spec?.containers || [])].map(container => ({
        name: container.name,
        image: container.image,
        resources: container.resources,
      })),
    });
  }

  stable() {
    if (!this.pods.size) throw new Failure('unknown', 'No workload pods found');
    for (const pod of this.pods.values()) {
      if (!pod.ready) throw new Failure('unknown', `Pod is not Ready: ${pod.name}`);
    }
    if (this.baseline) {
      for (const name of this.baseline.keys())
        if (!this.pods.has(name)) throw new Failure('unknown', `Pod disappeared: ${name}`);
    }
  }

  deployed() {
    this.stable();
    this.baseline = new Map([...this.pods].map(([name, pod]) => [name, structuredClone(pod)]));
  }
}

export function quantities(cpu, memory) {
  const match = /^(\d+(?:\.\d+)?)([KMG]i?|)$/.exec(memory);
  if (!match) throw new Error(`Unrecognized memory quantity: ${memory}`);
  const scale = {'': 1, K: 1000, Ki: 1024, M: 1e6, Mi: 1024 ** 2, G: 1e9, Gi: 1024 ** 3}[match[2]];
  const cores = cpu.endsWith('m') ? Number(cpu.slice(0, -1)) / 1000 : Number(cpu);
  if (!Number.isFinite(cores)) throw new Error(`Unrecognized CPU quantity: ${cpu}`);
  return {cpuCores: cores, memoryBytes: Number(match[1]) * scale};
}

export class PodWatcher {
  state = new PodState();
  metrics = {samples: 0, peaks: {}, errors: []};
  controller = new AbortController();

  constructor(runtime, onFailure) {
    this.runtime = runtime;
    this.onFailure = error => {
      if (!this.error) {
        this.error = error instanceof Failure ? error : new Failure('kit', error.message);
        onFailure(this.error);
      }
    };
  }

  start() {
    this.watching = this.watch();
    this.sampling = this.sample();
  }

  async snapshot() {
    const data = JSON.parse(
      await command('kubectl', ['get', 'pods', '-n', 'solo-tck', '-o', 'json'], {...this.runtime, timeout: 10_000}),
    );
    const names = new Set(data.items.map(pod => pod.metadata.name));
    for (const name of this.state.pods.keys()) if (!names.has(name)) this.state.pods.delete(name);
    this.state.observe(data);
  }

  async watch() {
    const signal = this.controller.signal;
    while (!signal.aborted) {
      try {
        await new Promise((resolve, reject) => {
          const child = spawn(
            'kubectl',
            ['get', 'pods', '-n', 'solo-tck', '--watch', '--output-watch-events', '-o', 'json'],
            {
              env: this.runtime.env,
              shell: false,
              detached: true,
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          );
          let killTimer;
          const abort = () => {
            stop(child);
            killTimer = setTimeout(() => stop(child, 'SIGKILL'), 2000);
          };
          signal.addEventListener('abort', abort, {once: true});
          const parse = jsonObjects(event => this.state.observe(event));
          child.stdout.on('data', chunk => {
            try {
              parse(chunk);
            } catch (error) {
              this.onFailure(error);
              stop(child);
            }
          });
          child.stderr.resume();
          child.once('error', reject);
          child.once('close', () => {
            clearTimeout(killTimer);
            signal.removeEventListener('abort', abort);
            resolve();
          });
        });
        if (this.state.pods.size && !signal.aborted)
          throw new Failure('unknown', 'Pod watch disconnected; stability evidence is incomplete');
        await delay(1000, undefined, {signal});
      } catch (error) {
        if (!signal.aborted) this.onFailure(error);
        break;
      }
    }
  }

  async sample() {
    const signal = this.controller.signal;
    while (!signal.aborted) {
      try {
        if (this.state.pods.size) {
          // Poll as well as watch so a persistent image-pull failure cannot hide behind an idle stream.
          await this.snapshot();
          if (this.state.baseline) this.state.stable();
        }
      } catch (error) {
        if (!signal.aborted) this.onFailure(error);
      }
      try {
        if (this.state.baseline && !signal.aborted) {
          const top = await command('kubectl', ['top', 'pod', '-n', 'solo-tck', '--containers', '--no-headers'], {
            ...this.runtime,
            signal,
            timeout: 10_000,
          });
          for (const line of top.trim().split('\n').filter(Boolean)) {
            const [pod, container, cpu, memory] = line.trim().split(/\s+/);
            const current = quantities(cpu, memory);
            const key = `${pod}/${container}`;
            const previous = this.metrics.peaks[key] || {cpuCores: 0, memoryBytes: 0};
            this.metrics.peaks[key] = {
              cpuCores: Math.max(previous.cpuCores, current.cpuCores),
              memoryBytes: Math.max(previous.memoryBytes, current.memoryBytes),
            };
          }
          this.metrics.samples++;
        }
      } catch (error) {
        if (!signal.aborted) this.metrics.errors.push(error.message);
      }
      try {
        await delay(15_000, undefined, {signal});
      } catch {
        break; /* Watcher was stopped. */
      }
    }
  }

  async stop() {
    this.controller.abort();
    await Promise.all([this.watching, this.sampling]);
  }
}
