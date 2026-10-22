// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {type FacadeMap} from '../../../../../src/business/runtime-state/collection/facade-map.js';
import {MutableStringFacadeMap} from '../../../../../src/business/runtime-state/collection/mutable-string-facade-map.js';
import {StringFacade} from '../../../../../src/business/runtime-state/facade/string-facade.js';

describe('MutableStringFacadeMap', (): void => {
  let myMap: FacadeMap<string, StringFacade, string>;
  const key1: string = 'key1';
  const key2: string = 'key2';

  beforeEach((): void => {
    myMap = new MutableStringFacadeMap(new Map<string, string>());
  });

  it('set should add a new element and get should retrieve it', (): void => {
    const stringFacade: StringFacade = new StringFacade('testValue');
    myMap.set(key1, stringFacade);
    expect(myMap.size).to.equal(1);
    expect(myMap.get(key1)).to.equal(stringFacade);
  });

  it('addNew should add a new element and return it, and allow subsequent update', (): void => {
    const initialFacade: StringFacade = myMap.addNew(key1);
    expect(initialFacade).to.be.instanceOf(StringFacade);
    expect(initialFacade.encapsulatedObject).to.equal('');
    expect(myMap.size).to.equal(1);
    expect(myMap.get(key1)).to.equal(initialFacade);

    // Verify we can update the value associated with key1 by using set with a new facade
    const updatedStringFacade: StringFacade = new StringFacade('updatedValue');
    myMap.set(key1, updatedStringFacade);
    expect(myMap.size).to.equal(1); // Size should remain 1 as it's an update
    expect(myMap.get(key1)).to.equal(updatedStringFacade);
    expect(myMap.get(key1)?.encapsulatedObject).to.equal('updatedValue');
  });

  it('set should update an existing element', (): void => {
    const stringFacade1: StringFacade = new StringFacade('value1');
    const stringFacade2: StringFacade = new StringFacade('value2');
    myMap.set(key1, stringFacade1);
    myMap.set(key1, stringFacade2);
    expect(myMap.size).to.equal(1);
    expect(myMap.get(key1)).to.equal(stringFacade2);
  });

  it('has should return true if the key exists', (): void => {
    const stringFacade: StringFacade = new StringFacade('testValue');
    myMap.set(key1, stringFacade);
    expect(myMap.has(key1)).to.be.true;
    expect(myMap.has(key2)).to.be.false;
  });

  it('delete should remove an element', (): void => {
    const stringFacade: StringFacade = new StringFacade('testValue');
    myMap.set(key1, stringFacade);
    expect(myMap.delete(key1)).to.be.true;
    expect(myMap.size).to.equal(0);
    expect(myMap.has(key1)).to.be.false;
    expect(myMap.delete(key2)).to.be.false; // Try deleting non-existent key
  });

  it('clear should remove all elements', (): void => {
    const stringFacade1: StringFacade = new StringFacade('value1');
    const stringFacade2: StringFacade = new StringFacade('value2');
    myMap.set(key1, stringFacade1);
    myMap.set(key2, stringFacade2);
    myMap.clear();
    expect(myMap.size).to.equal(0);
    expect(myMap.has(key1)).to.be.false;
    expect(myMap.has(key2)).to.be.false;
  });

  it('keys should return an iterator of keys', (): void => {
    const stringFacade1: StringFacade = new StringFacade('value1');
    const stringFacade2: StringFacade = new StringFacade('value2');
    myMap.set(key1, stringFacade1);
    myMap.set(key2, stringFacade2);
    const keys: string[] = [...myMap.keys()];
    expect(keys).to.have.members([key1, key2]);
    expect(keys.length).to.equal(2);
  });

  it('values should return an iterator of values', (): void => {
    const stringFacade1: StringFacade = new StringFacade('value1');
    const stringFacade2: StringFacade = new StringFacade('value2');
    myMap.set(key1, stringFacade1);
    myMap.set(key2, stringFacade2);
    const values: StringFacade[] = [...myMap.values()];
    expect(values).to.have.members([stringFacade1, stringFacade2]);
    expect(values.length).to.equal(2);
  });

  it('entries should return an iterator of [key, value] pairs', (): void => {
    const stringFacade1: StringFacade = new StringFacade('value1');
    const stringFacade2: StringFacade = new StringFacade('value2');
    myMap.set(key1, stringFacade1);
    myMap.set(key2, stringFacade2);
    const entries: [string, StringFacade][] = [...myMap.entries()];
    // Use deep members for comparing arrays within arrays
    expect(entries).to.have.deep.members([
      [key1, stringFacade1],
      [key2, stringFacade2],
    ]);
    expect(entries.length).to.equal(2);
  });

  it('should iterate over [key, value] pairs using for...of', (): void => {
    const stringFacade1: StringFacade = new StringFacade('value1');
    const stringFacade2: StringFacade = new StringFacade('value2');
    myMap.set(key1, stringFacade1);
    myMap.set(key2, stringFacade2);

    const result: Array<[string, StringFacade]> = [];
    for (const entry of myMap) {
      // Relies on Symbol.iterator
      result.push(entry);
    }
    expect(result).to.have.deep.members([
      [key1, stringFacade1],
      [key2, stringFacade2],
    ]);
    expect(result.length).to.equal(2);
  });

  it('forEach should iterate over elements providing value, key, and map', (): void => {
    const stringFacade1: StringFacade = new StringFacade('value1');
    const stringFacade2: StringFacade = new StringFacade('value2');
    myMap.set(key1, stringFacade1);
    myMap.set(key2, stringFacade2);

    const keysProcessed: string[] = [];
    const valuesProcessed: StringFacade[] = [];

    for (const [key, value] of myMap.entries()) {
      keysProcessed.push(key);
      valuesProcessed.push(value);
      expect(myMap.get(key)).to.equal(value); // Check consistency with map instance
      expect(myMap.size).to.equal(2);
    }

    expect(keysProcessed).to.have.members([key1, key2]);
    expect(valuesProcessed).to.have.members([stringFacade1, stringFacade2]);
    expect(keysProcessed.length).to.equal(2);
    expect(valuesProcessed.length).to.equal(2);
  });

  it('should write through to the encapsulated map and load existing entries', (): void => {
    const encapsulatedMap: Map<string, string> = new Map<string, string>([[key2, 'existing']]);
    const map: FacadeMap<string, StringFacade, string> = new MutableStringFacadeMap(encapsulatedMap);
    expect(map.get(key2)?.encapsulatedObject).to.equal('existing');

    map.set(key1, new StringFacade('value1'));
    expect(encapsulatedMap.get(key1)).to.equal('value1');

    map.delete(key2);
    expect(encapsulatedMap.has(key2)).to.be.false;

    map.clear();
    expect(encapsulatedMap.size).to.equal(0);
  });
});
