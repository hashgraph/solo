// SPDX-License-Identifier: Apache-2.0

/** Returns why the value is unacceptable, or `undefined` when it is acceptable. */
export type FlagRule = (value: string) => string | undefined;
