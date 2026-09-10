// SPDX-License-Identifier: Apache-2.0

import pino, {type Logger as PinoLogger, type LoggerOptions, type StreamEntry} from 'pino';
import pinoPretty from 'pino-pretty';
import {createStream, type Options as RotatingFileStreamOptions, type RotatingFileStream} from 'rotating-file-stream';
import {type Writable} from 'node:stream';
import {accessSync, constants as fileSystemConstants, existsSync, mkdirSync} from 'node:fs';
import {v4 as uuidv4} from 'uuid';
// eslint-disable-next-line unicorn/import-style
import * as util from 'node:util';
import chalk from 'chalk';
import * as constants from '../constants.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type SoloLogger} from './solo-logger.js';
import {OneShotState} from '../one-shot-state.js';
import {SoloErrors} from '../errors/solo-errors.js';
import {SoloError} from '../errors/solo-error.js';
import {FatalErrorReporter} from '../fatal-error-reporter.js';
import {MessageLevel} from './message-level.js';

type ChalkColor = typeof chalk.red;

/**
 * Pino-based implementation of the SoloLogger interface.
 *
 * Emits two files under the `logs` subdirectory of the container-configured Solo home directory:
 *  - solo.ndjson : newline-delimited JSON (authoritative)
 *  - solo.log    : pretty human-readable
 */
@injectable()
export class SoloPinoLogger implements SoloLogger {
  private readonly pinoLogger: PinoLogger;
  private traceId?: string;
  private readonly logBindings: Record<string, unknown> = {};
  private messageGroupMap: Map<string, string[]> = new Map();
  private deferredUserOutput: string[] | undefined;
  // Streams that pino.multistream writes to when file rotation is active; flush() ends them to
  // drain their asynchronous buffers to disk before the process exits. Empty on the CI path.
  private readonly rotatingStreams: Writable[] = [];
  private readonly MINOR_LINE_SEPARATOR: string =
    '-------------------------------------------------------------------------------';

  /**
   * Log files are created owner-only. Solo logs command lines, Helm arguments and Kubernetes
   * responses; the object redaction configured below is best-effort, so the files must not be
   * readable by other users on a shared machine. `0644` — what the stream libraries default to —
   * is world-readable and violates the SOLO_HOME permission policy the e2e suite asserts.
   *
   * The mode is applied at creation rather than chmod'ed afterwards, which would leave a window at
   * `0644` and would miss the files rotation creates later. A umask can only clear further bits, so
   * the result is never looser than this.
   */
  private static readonly LOG_FILE_MODE: number = 0o600;
  /** Matching owner-only mode for the directory holding those files. */
  private static readonly LOG_DIRECTORY_MODE: number = 0o700;

  private static readonly MAX_BOX_WIDTH: number = 120;
  private static readonly MIN_BOX_WIDTH: number = 70;

  /**
   * Resolves the home directory whose `logs` subdirectory receives the log files. Honouring the
   * container-configured home keeps a container pointed at a different home — the test container,
   * for example — from writing into the user's real `~/.solo/logs`.
   */
  private static resolveHomeDirectory(homeDirectory: string | undefined): string {
    if (homeDirectory) {
      return homeDirectory;
    }
    try {
      return patchInject(homeDirectory, InjectTokens.HomeDirectory, SoloPinoLogger.name);
    } catch {
      // The logger can be constructed before the container is initialized, in which case no home has
      // been configured yet and the default is the correct destination.
      return constants.SOLO_HOME_DIR;
    }
  }

  /**
   * @param logLevel - the log level to use (fatal|error|warn|info|debug|trace)
   * @param developmentMode - if true, show full stack traces in error messages
   * @param homeDirectory - the Solo home directory whose `logs` subdirectory receives the log files
   */
  public constructor(
    @inject(InjectTokens.LogLevel) logLevel?: string,
    @inject(InjectTokens.DevelopmentMode) private developmentMode?: boolean,
    @inject(InjectTokens.OneShotState) private readonly oneShotState?: OneShotState,
    @inject(InjectTokens.HomeDirectory) homeDirectory?: string,
  ) {
    logLevel = patchInject(logLevel, InjectTokens.LogLevel, this.constructor.name) ?? 'info';
    this.developmentMode = patchInject(developmentMode, InjectTokens.DevelopmentMode, this.constructor.name);

    this.nextTraceId();

    // The home directory is resolved from the container so a container pointed at a different home
    // writes there rather than into the user's real ~/.solo/logs. The directory itself is created by
    // findLogDestinationFailure below, which runs before any stream is built.
    const logsDirectory: string = PathEx.join(SoloPinoLogger.resolveHomeDirectory(homeDirectory), 'logs');

    // Configure dual outputs: NDJSON (machine) + pretty (human)
    const ndjsonFileName: string = 'solo.ndjson';
    const prettyFileName: string = 'solo.log';

    // A broken log destination must not stop the command from running: report it with its code and
    // remediation, then fall back to console-only logging. `solo deployment create` still works when
    // ~/.solo/logs is unwritable; the user simply loses the log files and is told why.
    const destinationFailure: SoloError | undefined = SoloPinoLogger.findLogDestinationFailure(logsDirectory, [
      ndjsonFileName,
      prettyFileName,
    ]);

    // Shared pino-pretty formatting options; the destination is supplied per output below.
    const prettyOptions: NonNullable<Parameters<typeof pinoPretty>[0]> = {
      translateTime: 'HH:MM:ss.l', // prepend timestamp as [HH:MM:ss.ms]
      colorize: false, // disable pino-pretty color output (avoid ANSI codes)
      messageKey: 'msg', // use the 'msg' property as the main log message
      messageFormat: '{msg} [traceId="{traceId}"]', // format line: message + traceId suffix
      ignore: 'pid,hostname,traceId', // exclude these fields from printed output
      colorizeObjects: false, // don't colorize objects or nested values
      crlf: false, // use '\n' (Unix newlines) instead of '\r\n' (Windows)
      hideObject: false, // don't hide full object payloads after message
    };

    const baseOptions: LoggerOptions = {
      level: logLevel,
      // Always include traceId and active log bindings when set via mixin
      mixin: (): Record<string, unknown> => ({
        ...this.logBindings,
        ...(this.traceId ? {traceId: this.traceId} : {}),
      }),
      // Redact obvious secrets if they sneak into objects
      redact: {
        paths: ['*.authorization', '*.Authorization', '*.accessToken', '*.privateKey', '*.operatorKey'],
        remove: true,
      },
    };

    if (destinationFailure) {
      FatalErrorReporter.renderToStandardError(destinationFailure, 'WARNING');
      // Console-only: pretty output on stderr, so stdout stays clean for command results.
      this.pinoLogger = pino(baseOptions, pinoPretty({...prettyOptions, destination: 2}));
      return;
    }

    if (process.env.CI === 'true') {
      // Note: log rotation is not necessary in CI environments
      const ndjsonStream: ReturnType<typeof pino.destination> = pino.destination({
        dest: PathEx.join(logsDirectory, ndjsonFileName),
        sync: true,
        mode: SoloPinoLogger.LOG_FILE_MODE,
      });
      const prettyDestination: ReturnType<typeof pino.destination> = pino.destination({
        dest: PathEx.join(logsDirectory, prettyFileName),
        sync: true,
        mode: SoloPinoLogger.LOG_FILE_MODE,
      });
      const prettyStream: ReturnType<typeof pinoPretty> = pinoPretty({
        ...prettyOptions,
        destination: prettyDestination,
      });
      SoloPinoLogger.reportStreamFailures(ndjsonStream, PathEx.join(logsDirectory, ndjsonFileName));
      SoloPinoLogger.reportStreamFailures(prettyDestination, PathEx.join(logsDirectory, prettyFileName));
      this.pinoLogger = pino(
        baseOptions,
        pino.multistream([
          {level: logLevel, stream: ndjsonStream},
          {level: logLevel, stream: prettyStream},
        ] as StreamEntry[]),
      );
    } else {
      const rotationOptions: RotatingFileStreamOptions = {
        path: logsDirectory,
        size: constants.LOG_MAX_FILE_SIZE,
        interval: constants.LOG_ROTATION_INTERVAL,
        maxFiles: constants.LOG_MAX_FILES,
        mode: SoloPinoLogger.LOG_FILE_MODE,
      };
      const ndjsonStream: RotatingFileStream = createStream(ndjsonFileName, rotationOptions);
      const prettyDestination: RotatingFileStream = createStream(prettyFileName, rotationOptions);
      const prettyStream: ReturnType<typeof pinoPretty> = pinoPretty({
        ...prettyOptions,
        destination: prettyDestination,
      });
      // accessSync only reflects the read-only attribute on Windows — it does not consult ACLs — and a
      // disk can fill mid-run, so the preflight above is the fast path, not the only one. Without these
      // listeners such a failure surfaces asynchronously as an unactionable internal error.
      SoloPinoLogger.reportStreamFailures(ndjsonStream, PathEx.join(logsDirectory, ndjsonFileName));
      SoloPinoLogger.reportStreamFailures(prettyDestination, PathEx.join(logsDirectory, prettyFileName));
      // Track the streams multistream writes to so flush() can drain them before the process exits.
      this.rotatingStreams.push(ndjsonStream, prettyStream);
      this.pinoLogger = pino(
        baseOptions,
        pino.multistream([
          {level: logLevel, stream: ndjsonStream},
          {level: logLevel, stream: prettyStream},
        ] as StreamEntry[]),
      );
    }
  }

  public setDevMode(developmentMode: boolean): void {
    this.debug(`dev mode logging: ${developmentMode}`);
    this.developmentMode = developmentMode;
  }

  public isDevMode(): boolean {
    return this.developmentMode ?? false;
  }

  public nextTraceId(): void {
    this.traceId = uuidv4();
  }

  public setLogBinding(key: string, value: unknown): void {
    // disable-eslint-next-line unicorn/no-null
    if (([undefined, null, ''] as unknown[]).includes(value)) {
      delete this.logBindings[key];
      return;
    }

    this.logBindings[key] = value;
  }

  public addLogBindings(bindings: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(bindings)) {
      this.setLogBinding(key, value);
    }
  }

  public clearLogBindings(...keys: string[]): void {
    if (keys.length === 0) {
      for (const key of Object.keys(this.logBindings)) {
        delete this.logBindings[key];
      }
      return;
    }

    for (const key of keys) {
      delete this.logBindings[key];
    }
  }

  public prepMeta(meta: Record<string, unknown> = {}): Record<string, unknown> {
    if (this.traceId) {
      (meta as Record<string, unknown>)['traceId'] = this.traceId;
    }
    return meta;
  }

  public showUser(message: unknown, ...arguments_: unknown[]): void {
    const formatted: string = util.format(String(message), ...arguments_.map(String));
    this.writeUser(formatted);
    // Mirror existing behavior: also persist to logs at info level
    this.info(formatted);
  }

  public showUserUnlessOneShot(message: string): void {
    if (this.oneShotState?.isActive()) {
      this.debug(message);
    } else {
      this.showUser(message);
    }
  }

  /**
   * Single sink for user-facing terminal output. Honors silent mode and the deferred-output buffer.
   * Does not write to the structured log file; callers persist to the log separately.
   */
  private writeUser(line: string): void {
    if (constants.SOLO_SILENT_MODE) {
      return;
    }
    if (this.deferredUserOutput) {
      this.deferredUserOutput.push(line);
      return;
    }
    console.log(line);
  }

  public beginDeferredUserOutput(): void {
    this.deferredUserOutput ??= [];
  }

  public flushDeferredUserOutput(): void {
    const buffered: string[] | undefined = this.deferredUserOutput;
    this.deferredUserOutput = undefined;
    if (!buffered || constants.SOLO_SILENT_MODE) {
      return;
    }
    for (const line of buffered) {
      console.log(line);
    }
  }

  private stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
  }

  public padWithBorder(
    message: string,
    chalkColor: (...text: unknown[]) => string = chalk.red,
    length: number = 83,
  ): string {
    const border: string = chalkColor('│');
    const messageLines: string[] = [];
    for (const line of message.split('\n')) {
      const repeats: number = Math.max(0, length - this.stripAnsi(line).length - 4);
      messageLines.push(`${border} ${line}${' '.repeat(repeats)} ${border}`);
    }
    return messageLines.join('\n');
  }

  private buildCauseChain(error: Error): Error[] {
    const chain: Error[] = [error];
    let cause: unknown = error.cause;
    let depth: number = 0;
    while (cause instanceof Error && depth < 10) {
      chain.push(cause);
      cause = cause.cause;
      depth += 1;
    }
    return chain;
  }

  private getFormattedCode(error: Error): string {
    const formattedCode: string | undefined = error instanceof SoloError ? error.getFormattedCode() : undefined;
    return formattedCode ? `[${formattedCode}] ` : '';
  }

  private buildContentLines(error: Error, causeChain: Error[]): string[] {
    const lines: string[] = [];
    if (this.developmentMode) {
      let indent: string = ' ';
      let prefix: string = '';
      for (const entry of causeChain) {
        const messageText: string = this.getFormattedCode(entry) + entry.message;
        lines.push(chalk.red(indent + prefix + messageText));
        if (entry.stack) {
          const formatted: string = entry.stack
            .split('\n')
            .filter((line: string): boolean => !line.includes('node:internal'))
            .join('\n')
            .trim();
          lines.push(...(indent + formatted).split('\n').map((line: string): string => chalk.gray(line)), '');
        }
        indent += '  ';
        prefix += 'Caused by: ';
      }
    } else {
      const errorMessage: string = this.getFormattedCode(error) + error.message;
      lines.push(...errorMessage.split('\n').map((line: string): string => chalk.red(line)));
    }

    if (!this.developmentMode) {
      // The outermost error is often a generic wrapper (e.g. one-shot deploy failed); the deepest
      // SoloError in the cause chain carries the most specific troubleshooting guidance. The chain is
      // ordered outermost-first, so the last qualifying entry is the deepest one.
      let troubleshootingSource: SoloError | undefined;
      for (const entry of causeChain) {
        if (entry instanceof SoloError && (entry.getTroubleshootingSteps()?.length ?? 0) > 0) {
          troubleshootingSource = entry;
        }
      }
      const troubleshootingSteps: ReadonlyArray<string> | undefined = troubleshootingSource?.getTroubleshootingSteps();
      if (troubleshootingSteps && troubleshootingSteps.length > 0) {
        for (const step of troubleshootingSteps) {
          lines.push(chalk.cyan('  →') + ' ' + step);
        }
      }
    }
    if (error instanceof SoloError) {
      const documentUrl: string | undefined = error.getDocumentUrl();
      if (documentUrl) {
        lines.push('', chalk.cyan(`Learn more: ${documentUrl}`));
      }
    }
    return lines;
  }

  private wrapLine(line: string, maxWidth: number): string[] {
    const plainText: string = this.stripAnsi(line);
    if (plainText.length <= maxWidth) {
      return [line];
    }

    // eslint-disable-next-line no-control-regex
    const ansiPrefix: string = line.match(/^(?:\[[0-9;]*m)+/)?.[0] ?? '';
    const ansiSuffix: string = ansiPrefix ? '[0m' : '';

    const indent: string = plainText.match(/^(\s*)/)?.[1] ?? '';

    const result: string[] = [];
    let remaining: string = plainText;

    while (remaining.length > maxWidth) {
      // Search outside the indent so wrapping never splits within it and
      // continuation lines stay at the same indentation level.
      const relativeSpaceAt: number = remaining.slice(indent.length).lastIndexOf(' ', maxWidth - 1 - indent.length);
      const spaceAt: number = relativeSpaceAt === -1 ? -1 : indent.length + relativeSpaceAt;
      const breakAt: number = spaceAt > 0 ? spaceAt : maxWidth;
      result.push(ansiPrefix + remaining.slice(0, breakAt) + ansiSuffix);
      const afterBreak: string = remaining.slice(spaceAt > 0 ? breakAt + 1 : breakAt);
      remaining = indent + afterBreak;
    }

    if (remaining) {
      result.push(ansiPrefix + remaining + ansiSuffix);
    }

    return result.length > 0 ? result : [line];
  }

  private renderErrorBox(lines: string[]): void {
    const maxInteriorWidth: number = SoloPinoLogger.MAX_BOX_WIDTH - 4;
    const wrappedLines: string[] = lines.flatMap((line: string): string[] => this.wrapLine(line, maxInteriorWidth));
    const maxContentWidth: number = Math.max(...wrappedLines.map((l): number => this.stripAnsi(l).length));
    const boxWidth: number = Math.min(
      SoloPinoLogger.MAX_BOX_WIDTH,
      Math.max(SoloPinoLogger.MIN_BOX_WIDTH, maxContentWidth + 4),
    );
    const interiorWidth: number = boxWidth - 4;
    console.log(chalk.red(`╭─ ERROR ─${'─'.repeat(interiorWidth - 7)}╮`));
    for (const line of wrappedLines) {
      console.log(this.padWithBorder(line, chalk.red, boxWidth));
    }
    console.log(chalk.red(`╰${'─'.repeat(interiorWidth + 2)}╯`));
  }

  private buildSilentErrorOutput(error: Error, causeChain: Error[]): Record<string, unknown> {
    return {
      level: 'ERROR',
      message: this.getFormattedCode(error) + error.message,
      stack: error.stack,
      causes: causeChain.slice(1).map((cause: Error): Record<string, unknown> => ({
        message: this.getFormattedCode(cause) + cause.message,
        stack: cause.stack,
      })),
    };
  }

  /**
   * Returns the coded failure when the log directory, or an existing log file inside it, cannot be
   * written, and `undefined` when the destination is usable.
   *
   * The stream implementations report this asynchronously, after the constructor has already returned, so
   * it escapes as an unactionable internal error — and because reporting it writes another log line, it can
   * repeat without bound. Probing up front turns the whole class of failure into one coded error naming the
   * offending path, which the constructor renders before falling back to console-only logging.
   */
  private static findLogDestinationFailure(logsDirectory: string, fileNames: string[]): SoloError | undefined {
    try {
      mkdirSync(logsDirectory, {recursive: true, mode: SoloPinoLogger.LOG_DIRECTORY_MODE});
      accessSync(logsDirectory, fileSystemConstants.W_OK);
    } catch (error) {
      return new SoloErrors.system.soloLogsDirectoryNotWritable(logsDirectory, error as Error);
    }

    for (const fileName of fileNames) {
      const filePath: string = PathEx.join(logsDirectory, fileName);
      if (!existsSync(filePath)) {
        continue;
      }
      try {
        accessSync(filePath, fileSystemConstants.W_OK);
      } catch (error) {
        return new SoloErrors.system.soloLogsDirectoryNotWritable(filePath, error as Error);
      }
    }

    return undefined;
  }

  /**
   * Routes an asynchronous write failure on a log stream through the same coded error as the preflight.
   *
   * Without this, a destination that only fails once writing starts — a Windows ACL the preflight cannot
   * see, or a disk that fills mid-run — surfaces as an unhandled stream error rather than as SOLO-5083.
   */
  private static reportStreamFailures(stream: NodeJS.EventEmitter, filePath: string): void {
    let reported: boolean = false;

    stream.on('error', (streamError: Error): void => {
      // The listener stays attached for the life of the stream: detaching it after the first failure
      // would make the next failed write an unhandled 'error' event, which crashes the process. Once
      // the destination is known bad every later failure says the same thing, so only the first is
      // rendered — otherwise a stream that fails on every flush reproduces the report flood of #5370.
      if (reported) {
        return;
      }
      reported = true;

      FatalErrorReporter.renderToStandardError(
        new SoloErrors.system.soloLogsDirectoryNotWritable(filePath, streamError),
        'WARNING',
      );
    });
  }

  public showUserError(error: unknown): void {
    const normalizedError: Error = error instanceof Error ? error : new Error(String(error));
    const causeChain: Error[] = this.buildCauseChain(normalizedError);
    const lines: string[] = this.buildContentLines(normalizedError, causeChain);

    if (constants.SOLO_SILENT_MODE) {
      console.error(JSON.stringify(this.buildSilentErrorOutput(normalizedError, causeChain), undefined, 2));
    } else {
      this.renderErrorBox(lines);
    }

    this.toPino('error', error, []);
  }

  public error(message: unknown, ...arguments_: unknown[]): void {
    this.toPino('error', message, arguments_);
  }

  public warn(message: unknown, ...arguments_: unknown[]): void {
    this.toPino('warn', message, arguments_);
  }

  public info(message: unknown, ...arguments_: unknown[]): void {
    this.toPino('info', message, arguments_);
  }

  public debug(message: unknown, ...arguments_: unknown[]): void {
    this.toPino('debug', message, arguments_);
  }

  public showList(title: string, items: string[] = []): boolean {
    this.showUser(chalk.green(`\n *** ${title} ***`));
    this.showUser(chalk.green(this.MINOR_LINE_SEPARATOR));
    if (items.length > 0) {
      for (const name of items) {
        this.showUser(chalk.cyan(` - ${name}`));
      }
    } else {
      this.showUser(chalk.blue('[ None ]'));
    }

    this.showUser('\n');
    return true;
  }

  public showListIfNotEmpty(title: string, items: string[] = []): boolean {
    if (items.length === 0) {
      return false;
    }
    return this.showList(title, items);
  }

  public showJSON(title: string, object: object): void {
    this.showUser(chalk.green(`\n *** ${title} ***`));
    this.showUser(chalk.green(this.MINOR_LINE_SEPARATOR));
    const serialized: string = JSON.stringify(object, undefined, 2);
    this.writeUser(serialized);
  }

  public getMessageGroup(key: string): string[] {
    if (!this.messageGroupMap.has(key)) {
      throw new SoloErrors.internal.loggerMessageGroupNotFound(key);
    }
    return this.messageGroupMap.get(key);
  }

  public addMessageGroup(key: string, title: string): void {
    if (this.messageGroupMap.has(key)) {
      this.warn(`Message group with key "${key}" already exists. Skipping.`);
      return;
    }
    this.messageGroupMap.set(key, [`${title}:`]);
    this.debug(`Added message group "${title}" with key "${key}".`);
  }

  public addMessageGroupMessage(key: string, message: string): void {
    if (!this.messageGroupMap.has(key)) {
      throw new SoloErrors.internal.loggerMessageGroupNotFound(key);
    }
    this.messageGroupMap.get(key)!.push(message);
    this.debug(`Added message to group "${key}": ${message}`);
  }

  public showMessageGroup(key: string, messageLevel: MessageLevel = MessageLevel.INFO): void {
    if (!this.messageGroupMap.has(key)) {
      this.warn(`Message group with key "${key}" does not exist.`);
      return;
    }

    let titleColor: ChalkColor;
    let textColor: ChalkColor;
    switch (messageLevel) {
      case MessageLevel.ERROR: {
        titleColor = chalk.red;
        textColor = chalk.red;
        break;
      }
      case MessageLevel.WARN: {
        titleColor = chalk.yellow;
        textColor = chalk.yellow;
        break;
      }
      default: {
        titleColor = chalk.green;
        textColor = chalk.cyan;
        break;
      }
    }

    const messages: string[] = this.messageGroupMap.get(key)!;
    this.showUser(titleColor(`\n *** ${messages[0]} ***`));
    this.showUser(titleColor(this.MINOR_LINE_SEPARATOR));
    for (let index: number = 1; index < messages.length; index++) {
      this.showUser(textColor(` - ${messages[index]}`));
    }
    this.showUser(titleColor(this.MINOR_LINE_SEPARATOR));
    this.debug(`Displayed message group "${key}".`);
  }

  public getMessageGroupKeys(): string[] {
    return [...this.messageGroupMap.keys()];
  }

  public showAllMessageGroups(): void {
    const keys: string[] = this.getMessageGroupKeys();
    if (keys.length === 0) {
      this.debug('No message groups available.');
      return;
    }
    for (const key of keys) {
      this.showMessageGroup(key);
    }
  }

  public flush(callback: (error?: Error) => void): void {
    this.info('Flushing logs and exiting...');

    // CI (and any non-rotating setup): destinations are synchronous, so defer to pino's own flush.
    if (this.rotatingStreams.length === 0) {
      this.pinoLogger.flush(callback);
      return;
    }

    // pino.multistream exposes no flush(), and rotating-file-stream writes asynchronously. Ending each
    // stream drains its buffer to disk (the pretty stream flushes through to, and closes, its rotating
    // destination). Wait for every stream to close before invoking the callback, with a safety timeout
    // so the CLI can never hang on exit if a 'close' event is missed.
    let pending: number = this.rotatingStreams.length;
    let settled: boolean = false;
    const settle: () => void = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };
    const onStreamClosed: () => void = (): void => {
      pending -= 1;
      if (pending === 0) {
        settle();
      }
    };
    // unref() so the timer alone never keeps the process alive; the settled guard prevents a
    // double callback if a stream closes after the timeout has already fired.
    setTimeout(settle, 2000).unref();
    for (const stream of this.rotatingStreams) {
      stream.once('close', onStreamClosed);
      stream.end();
    }
  }

  private toPino(level: 'info' | 'warn' | 'error' | 'debug', message: unknown, arguments_: unknown[]): void {
    // Build base object (traceId via mixin already present, but include explicitly for clarity in unit tests)
    let object: Record<string, unknown> = {};
    const meta: Record<string, unknown> = this.prepMeta({});

    // Prefer structured errors/objects when provided
    if (message instanceof Error) {
      object = {...object, ...meta, err: message};
      this.pinoLogger[level](object, (message as Error).message ?? 'Error');
      return;
    }

    if (message && typeof message === 'object') {
      object = {...object, ...meta, ...(message as Record<string, unknown>)};
      const message_: string | undefined =
        arguments_.length > 0 ? util.format('%s', ...arguments_.map(String)) : undefined;
      if (message_) {
        this.pinoLogger[level](object, message_);
      } else {
        this.pinoLogger[level](object);
      }
      return;
    }

    const formatted: string = util.format(String(message), ...(arguments_ as unknown[]));
    this.pinoLogger[level](meta, formatted);
  }
}
