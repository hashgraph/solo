// SPDX-License-Identifier: Apache-2.0

/**
 * Converts Kubernetes resource quantity strings (`500Gi`, `100M`, `1500m`) into bytes.
 *
 * Kubernetes accepts both binary suffixes (Ki, Mi, Gi, Ti, Pi, Ei) and decimal SI suffixes
 * (k, M, G, T, P, E), so `1Gi` (1073741824) and `1G` (1000000000) are different quantities and
 * cannot be treated interchangeably when comparing a claim's request against real capacity.
 */
export class KubernetesQuantity {
  private static readonly BINARY_MULTIPLIERS: ReadonlyMap<string, number> = new Map<string, number>([
    ['Ki', 1024],
    ['Mi', 1024 ** 2],
    ['Gi', 1024 ** 3],
    ['Ti', 1024 ** 4],
    ['Pi', 1024 ** 5],
    ['Ei', 1024 ** 6],
  ]);

  private static readonly DECIMAL_MULTIPLIERS: ReadonlyMap<string, number> = new Map<string, number>([
    ['m', 0.001],
    ['', 1],
    ['k', 1000],
    ['K', 1000],
    ['M', 1000 ** 2],
    ['G', 1000 ** 3],
    ['T', 1000 ** 4],
    ['P', 1000 ** 5],
    ['E', 1000 ** 6],
  ]);

  private static readonly QUANTITY_PATTERN: RegExp = /^(\d+(?:\.\d+)?)([EPTGMK]i|[EPTGMKkm])?$/;

  /**
   * @param quantity - a Kubernetes quantity string
   * @returns the quantity in bytes, or undefined when the value is absent or not a valid quantity
   */
  public static toBytes(quantity?: string): number | undefined {
    if (!quantity) {
      return undefined;
    }

    const match: RegExpExecArray | null = KubernetesQuantity.QUANTITY_PATTERN.exec(quantity.trim());
    if (!match) {
      return undefined;
    }

    const amount: number = Number(match[1]);
    const suffix: string = match[2] ?? '';
    const multiplier: number | undefined =
      KubernetesQuantity.BINARY_MULTIPLIERS.get(suffix) ?? KubernetesQuantity.DECIMAL_MULTIPLIERS.get(suffix);

    return multiplier === undefined ? undefined : amount * multiplier;
  }

  /** Renders a byte count as a human-readable binary quantity, for use in user-facing messages. */
  public static format(bytes: number): string {
    const units: string[] = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    let value: number = bytes;
    let unitIndex: number = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
  }
}
