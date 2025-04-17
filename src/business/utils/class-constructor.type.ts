// SPDX-License-Identifier: Apache-2.0

export type ClassConstructor<T> = {
  new (...arguments_: unknown[]): T;
};
