// SPDX-License-Identifier: Apache-2.0

export class ReleaseItem {
  constructor(
    public readonly name: string,
    public readonly namespace: string,
    public readonly revision: string,
    public readonly updated: string,
    public readonly status: string,
    public readonly chart: string,
    public readonly app_version: string,
  ) {}
}
