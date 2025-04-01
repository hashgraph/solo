// SPDX-License-Identifier: Apache-2.0

import * as winston from 'winston';
import {v4 as uuidv4} from 'uuid';
import * as util from 'node:util';
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
   * @param developmentMode - if true, show full stack traces in error messages
   */
  public constructor(
    @inject(InjectTokens.LogLevel) logLevel?: string,
    @inject(InjectTokens.DevelopmentMode) private developmentMode?: boolean | null,
  ) {
    logLevel = patchInject(logLevel, InjectTokens.LogLevel, this.constructor.name);
    this.developmentMode = patchInject(developmentMode, InjectTokens.DevelopmentMode, this.constructor.name);

    this.nextTraceId();

    this.winstonLogger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(customFormat, winston.format.json()),
      transports: [new winston.transports.File({filename: PathEx.join(constants.SOLO_LOGS_DIR, 'solo.log')})],
    });
  }

  public setDevMode(developmentMode: boolean) {
    this.debug(`dev mode logging: ${developmentMode}`);
    this.developmentMode = developmentMode;
  }

  public nextTraceId() {
    this.traceId = uuidv4();
  }

  public prepMeta(meta: object | any = {}): object | any {
    meta.traceId = this.traceId;
    return meta;
  }

  public showUser(message: any, ...arguments_: any) {
    console.log(util.format(message, ...arguments_));
    this.info(util.format(message, ...arguments_));
  }

  public showUserError(error: Error | any) {
    const stack = [{message: error.message, stacktrace: error.stack}];
    if (error.cause) {
      let depth = 0;
      let cause = error.cause;
      while (cause !== undefined && depth < 10) {
        if (cause.stack) {
          stack.push({message: cause.message, stacktrace: cause.stack});
        }

        cause = cause.cause;
        depth += 1;
      }
    }

    console.log(chalk.red('*********************************** ERROR *****************************************'));
    if (this.developmentMode) {
      let prefix = '';
      let indent = '';
      for (const s of stack) {
        console.log(indent + prefix + chalk.yellow(s.message));
        // Remove everything after the first "Caused by: " and add indentation
        const formattedStacktrace = s.stacktrace
          .replace(/Caused by:.*/s, '')
          .replace(/\n\s*/g, '\n' + indent)
          .trim();
        console.log(indent + chalk.gray(formattedStacktrace) + '\n');
        indent += '  ';
        prefix = 'Caused by: ';
      }
    } else {
      const lines: string[] = error.message.split('\n');
      for (const line of lines) {
        console.log(chalk.yellow(line));
      }
    }
    console.log(chalk.red('***********************************************************************************'));

    this.error(error.message, error);
  }

  public error(message: any, ...arguments_: any) {
    this.winstonLogger.error(message, ...arguments_, this.prepMeta());
  }

  public warn(message: any, ...arguments_: any) {
    this.winstonLogger.warn(message, ...arguments_, this.prepMeta());
  }

  public info(message: any, ...arguments_: any) {
    this.winstonLogger.info(message, ...arguments_, this.prepMeta());
  }

  public debug(message: any, ...arguments_: any) {
    this.winstonLogger.debug(message, ...arguments_, this.prepMeta());
  }

  public showList(title: string, items: string[] = []) {
    this.showUser(chalk.green(`\n *** ${title} ***`));
    this.showUser(chalk.green('-------------------------------------------------------------------------------'));
    if (items.length > 0) {
      for (const name of items) this.showUser(chalk.cyan(` - ${name}`));
    } else {
      this.showUser(chalk.blue('[ None ]'));
    }

    this.showUser('\n');
    return true;
  }

  public showJSON(title: string, object: object) {
    this.showUser(chalk.green(`\n *** ${title} ***`));
    this.showUser(chalk.green('-------------------------------------------------------------------------------'));
    console.log(JSON.stringify(object, null, ' '));
  }
}
