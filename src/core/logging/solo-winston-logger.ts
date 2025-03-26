// SPDX-License-Identifier: Apache-2.0

import * as winston from 'winston';
import {v4 as uuidv4} from 'uuid';
import * as util from 'util';
import chalk from 'chalk';
import * as constants from '../constants.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type SoloLogger} from './solo-logger.js';

const customFormat = winston.format.combine(
  winston.format.label({label: 'SOLO', message: false}),

  winston.format.splat(),

  // include timestamp in logs
  winston.format.timestamp(),

  winston.format.ms(),

  // add label metadata
  winston.format.label({label: ''}),

  // convert levels to upper case
  winston.format(data => {
    data.level = data.level.toUpperCase();
    return data;
  })(),

  // use custom format TIMESTAMP [LABEL] LEVEL: MESSAGE
  winston.format.printf(data => `${data.timestamp}|${data.level}| ${data.message}`),

  // Ignore log messages if they have { private: true }
  winston.format(data => (data.private ? false : data))(),
);

@injectable()
export class SoloWinstonLogger implements SoloLogger {
  private winstonLogger: winston.Logger;
  private traceId?: string;

  /**
   * @param logLevel - the log level to use
   * @param devMode - if true, show full stack traces in error messages
   */
  public constructor(
    @inject(InjectTokens.LogLevel) logLevel?: string,
    @inject(InjectTokens.DevMode) private devMode?: boolean | null,
  ) {
    logLevel = patchInject(logLevel, InjectTokens.LogLevel, this.constructor.name);
    this.devMode = patchInject(devMode, InjectTokens.DevMode, this.constructor.name);

    this.nextTraceId();

    this.winstonLogger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(customFormat, winston.format.json()),
      transports: [new winston.transports.File({filename: PathEx.join(constants.SOLO_LOGS_DIR, 'solo.log')})],
    });
  }

  public setDevMode(devMode: boolean) {
    this.debug(`dev mode logging: ${devMode}`);
    this.devMode = devMode;
  }

  public nextTraceId() {
    this.traceId = uuidv4();
  }

  public prepMeta(meta: object | any = {}): object | any {
    meta.traceId = this.traceId;
    return meta;
  }

  public showUser(msg: any, ...args: any) {
    console.log(util.format(msg, ...args));
    this.info(util.format(msg, ...args));
  }

  public showUserError(err: Error | any) {
    const stack = [{message: err.message, stacktrace: err.stack}];
    if (err.cause) {
      let depth = 0;
      let cause = err.cause;
      while (cause !== undefined && depth < 10) {
        if (cause.stack) {
          stack.push({message: cause.message, stacktrace: cause.stack});
        }

        cause = cause.cause;
        depth += 1;
      }
    }

    console.log(chalk.red('*********************************** ERROR *****************************************'));
    if (this.devMode) {
      let prefix = '';
      let indent = '';
      stack.forEach(s => {
        console.log(indent + prefix + chalk.yellow(s.message));
        // Remove everything after the first "Caused by: " and add indentation
        const formattedStacktrace = s.stacktrace
          .replace(/Caused by:.*/s, '')
          .replace(/\n\s*/g, '\n' + indent)
          .trim();
        console.log(indent + chalk.gray(formattedStacktrace) + '\n');
        indent += '  ';
        prefix = 'Caused by: ';
      });
    } else {
      const lines: string[] = err.message.split('\n');
      lines.forEach(line => {
        console.log(chalk.yellow(line));
      });
    }
    console.log(chalk.red('***********************************************************************************'));

    this.error(err.message, err);
  }

  public error(msg: any, ...args: any) {
    this.winstonLogger.error(msg, ...args, this.prepMeta());
  }

  public warn(msg: any, ...args: any) {
    this.winstonLogger.warn(msg, ...args, this.prepMeta());
  }

  public info(msg: any, ...args: any) {
    this.winstonLogger.info(msg, ...args, this.prepMeta());
  }

  public debug(msg: any, ...args: any) {
    this.winstonLogger.debug(msg, ...args, this.prepMeta());
  }

  public showList(title: string, items: string[] = []) {
    this.showUser(chalk.green(`\n *** ${title} ***`));
    this.showUser(chalk.green('-------------------------------------------------------------------------------'));
    if (items.length > 0) {
      items.forEach(name => this.showUser(chalk.cyan(` - ${name}`)));
    } else {
      this.showUser(chalk.blue('[ None ]'));
    }

    this.showUser('\n');
    return true;
  }

  public showJSON(title: string, obj: object) {
    this.showUser(chalk.green(`\n *** ${title} ***`));
    this.showUser(chalk.green('-------------------------------------------------------------------------------'));
    console.log(JSON.stringify(obj, null, ' '));
  }
}
