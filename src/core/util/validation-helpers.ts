// SPDX-License-Identifier: Apache-2.0

export function isValidEnum<E extends Record<string, string | number>>(
  value: unknown,
  enumeration: E,
): value is E[keyof E] {
  return Object.values(enumeration).includes(value as E[keyof E]);
}
