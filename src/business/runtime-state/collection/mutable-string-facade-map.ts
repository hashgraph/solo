// SPDX-License-Identifier: Apache-2.0

import {type FacadeMap} from './facade-map.js';
import {StringFacade} from '../facade/string-facade.js';

export class MutableStringFacadeMap implements FacadeMap<string, StringFacade, string> {
  private readonly facadeMap: Map<string, StringFacade> = new Map<string, StringFacade>();

  public constructor(private readonly encapsulatedMap: Map<string, string>) {
    for (const [key, value] of encapsulatedMap.entries()) {
      this.facadeMap.set(key, new StringFacade(value));
    }
  }

  public addNew(key: string): StringFacade {
    const facade: StringFacade = new StringFacade('');
    this.set(key, facade);

    return facade;
  }

  public get(key: string): StringFacade | undefined {
    return this.facadeMap.get(key);
  }

  public set(key: string, value: StringFacade): void {
    this.facadeMap.set(key, value);
    this.encapsulatedMap.set(key, value.encapsulatedObject);
  }

  public has(key: string): boolean {
    return this.facadeMap.has(key);
  }

  public forEach(callback: (value: StringFacade, key: string, map: Map<string, StringFacade>) => void): void {
    for (const [key, value] of this.facadeMap.entries()) {
      callback(value, key, this.facadeMap);
    }
  }

  public entries(): IterableIterator<[string, StringFacade]> {
    return this.facadeMap.entries();
  }

  public keys(): IterableIterator<string> {
    return this.facadeMap.keys();
  }

  public values(): IterableIterator<StringFacade> {
    return this.facadeMap.values();
  }

  public delete(key: string): boolean {
    this.encapsulatedMap.delete(key);

    return this.facadeMap.delete(key);
  }

  public clear(): void {
    this.facadeMap.clear();
    this.encapsulatedMap.clear();
  }

  public get size(): number {
    return this.facadeMap.size;
  }

  public *[Symbol.iterator](): MapIterator<[string, StringFacade]> {
    yield* this.facadeMap.entries();
  }

  public [Symbol.toStringTag](): string {
    return 'MutableStringFacadeMap';
  }
}
