// SPDX-License-Identifier: Apache-2.0

export interface SoloLogger {
  setDevMode(devMode: boolean): void;

  nextTraceId(): void;

  prepMeta(meta?: object | any): object | any;

  showUser(msg: any, ...args: any): void;

  showUserError(err: Error | any): void;

  error(msg: any, ...args: any): void;

  warn(msg: any, ...args: any): void;

  info(msg: any, ...args: any): void;

  debug(msg: any, ...args: any): void;

  showList(title: string, items: string[]): void;

  showJSON(title: string, obj: object): void;
}
