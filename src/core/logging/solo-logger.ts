// SPDX-License-Identifier: Apache-2.0

export interface SoloLogger {
  setDevMode(developmentMode: boolean): void;

  nextTraceId(): void;

  prepMeta(meta?: object | any): object | any;

  showUser(message: any, ...arguments_: any): void;

  showUserError(error: Error | any): void;

  error(message: any, ...arguments_: any): void;

  warn(message: any, ...arguments_: any): void;

  info(message: any, ...arguments_: any): void;

  debug(message: any, ...arguments_: any): void;

  showList(title: string, items: string[]): void;

  showJSON(title: string, object: object): void;
}
