// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../errors/solo-errors.js';
import {SubprocessEnvironment} from '../subprocess-environment.js';
import {SubprocessCommandProfile} from '../subprocess-command-profile.js';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';

/**
 * A representation of a leaseholder who is identified by a username, hostname, and process id (PID). This implementation
 * is serializable to/from a JSON object and is comparable to other leaseholders.
 */
export class LockHolder {
  /** The user's identity which is typically the OS login username. */
  private readonly _username: string;

  /** The machine's identity which is typically the hostname. */
  private readonly _hostname: string;

  /** The process identifier which is typically the OS PID. */
  private readonly _processId: number;

  /**
   * Constructs a new leaseholder with the given username, hostname, and process id. This constructor is private and
   * should not be called directly. Use the static factory methods to create a new instance.
   *
   * @param username - the user's identity.
   * @param hostname - the machine's identity.
   * @param processId - the process identifier.
   */
  private constructor(username: string, hostname: string, processId: number) {
    if (!username) {
      throw new SoloErrors.validation.missingArgument('username is required');
    }
    if (!hostname) {
      throw new SoloErrors.validation.missingArgument('hostname is required');
    }
    if (!processId) {
      throw new SoloErrors.validation.missingArgument('pid is required');
    }

    this._username = username;
    this._hostname = hostname;
    this._processId = processId;
  }

  /**
   * Creates a new leaseholder with the given username. The hostname is set to the current machine's hostname and the
   * process id is set to the current process's PID.
   * @param username - the user's identity.
   * @returns a new leaseholder instance.
   */
  public static of(username: string): LockHolder {
    return new LockHolder(username, os.hostname(), process.pid);
  }

  /**
   * Creates a new leaseholder by retrieving the current user's identity, the current machine's hostname, and the
   * current process's PID.
   * @returns a new leaseholder instance.
   */
  public static default(): LockHolder {
    return LockHolder.of(os.userInfo().username);
  }

  /**
   * The user's identity which is typically the OS login username.
   * @returns the user's identity.
   */
  public get username(): string {
    return this._username;
  }

  /**
   * The machine's identity which is typically the hostname.
   * @returns the machine's identity.
   */
  public get hostname(): string {
    return this._hostname;
  }

  /**
   * The process identifier which is typically the OS PID.
   * @returns the process identifier.
   */
  public get processId(): number {
    return this._processId;
  }

  /**
   * Returns a plain object representation of this leaseholder. This object may be serialized to JSON.
   * @returns a plain object representation of this leaseholder.
   */
  public toObject(): any {
    return {
      username: this._username,
      hostname: this._hostname,
      pid: this._processId,
    };
  }

  /**
   * Compares this leaseholder to another leaseholder to determine if they are equal. Two leaseholders are equal if
   * their username, hostname, and process id are the same.
   * @param other - the other leaseholder to compare.
   * @returns true if the leaseholders are equal; false otherwise.
   */
  public equals(other: LockHolder): boolean {
    return this.username === other.username && this.hostname === other.hostname && this.processId === other.processId;
  }

  /**
   * Compares this leaseholder to another leaseholder to determine if they are the same machine. Two leaseholders are
   * the same machine if their username and hostname are the same.
   * @param other - the other leaseholder to compare.
   * @returns true if the leaseholders are the same machine; false otherwise.
   */
  public isSameMachineIdentity(other: LockHolder): boolean {
    return this.username === other.username && this.hostname === other.hostname;
  }

  /**
   * Determines if the process associated with this leaseholder is still alive. A suspended process
   * (SIGSTOP / Ctrl+Z) still has a PID and is reported as alive by this method — use
   * {@link isProcessSuspended} to detect that case, or {@link isProcessLost} for the combined
   * "process can no longer renew its lease" check.
   * @returns true if the process is alive; false otherwise.
   */
  public isProcessAlive(): boolean {
    try {
      return process.kill(this.processId, 0);
    } catch (error: any) {
      return error.code === 'EPERM';
    }
  }

  /**
   * Determines if the process associated with this leaseholder is suspended (kernel "stopped"
   * state, typically produced by SIGSTOP or a terminal Ctrl+Z). A suspended process keeps its PID
   * but cannot run, so it cannot renew its Kubernetes lease — treating it as effectively gone is
   * what lets a fresh invocation reclaim the lock immediately rather than waiting the full lease
   * duration. Returns false on platforms with no SIGSTOP equivalent (Windows) or when the process
   * state cannot be determined.
   *
   * @returns true if the process exists and is in a suspended/stopped state; false otherwise.
   */
  public isProcessSuspended(): boolean {
    try {
      if (process.platform === 'linux') {
        const status: string = fs.readFileSync(`/proc/${this._processId}/status`, 'utf8');
        // Linux kernel reports state on a line like `State:\tT (stopped)` or `State:\tt (tracing stop)`.
        return /^State:\s+[Tt]\b/m.test(status);
      }
      if (process.platform === 'darwin') {
        // `ps -o stat= -p <pid>` prints the process state with no header; the first character is
        // 'T' for a stopped process. We do not pass a shell — args are array-passed to execFile.
        const stat: string = execFileSync('ps', ['-o', 'stat=', '-p', String(this._processId)], {
          shell: false,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          env: SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC),
        }).trim();
        return stat.startsWith('T');
      }
      // No SIGSTOP equivalent on Windows; treat as never suspended.
      return false;
    } catch {
      // If we cannot determine the state, do not aggressively claim suspension.
      return false;
    }
  }

  /**
   * Returns true when the holder's process can no longer renew its lease — either the PID is gone
   * or the process is suspended. Callers use this as the "is this lease safe to reclaim?" signal.
   *
   * @returns true if the process is dead or suspended; false otherwise.
   */
  public isProcessLost(): boolean {
    return !this.isProcessAlive() || this.isProcessSuspended();
  }

  /**
   * Serializes this leaseholder to a JSON string representation.
   * @returns a JSON string representation of this leaseholder.
   */
  public toJson(): string {
    return JSON.stringify(this.toObject());
  }

  /**
   * Deserializes a JSON string representation of a leaseholder into a new leaseholder instance.
   * @param json - the JSON string representation of a leaseholder.
   * @returns a new leaseholder instance.
   */
  public static fromJson(json: string): LockHolder {
    const object: ReturnType<LockHolder['toObject']> = JSON.parse(json);
    return new LockHolder(object.username, object.hostname, object.pid);
  }
}
