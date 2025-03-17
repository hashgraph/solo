// SPDX-License-Identifier: Apache-2.0

import {type ConfigSource} from '../../../../../src/data/configuration/spi/config-source.js';
import {SimpleConfigSourceFixture} from '../../../fixtures/simple-config-source.fixture.js';
import {LayeredConfig} from '../../../../../src/data/configuration/impl/layered-config.js';
import {expect} from 'chai';

class SimpleObject {
  constructor(
    public prop1?: string,
    public prop2?: number,
    public prop3?: boolean,
    public prop4?: string[],
  ) {}
}

describe('LayeredConfig', () => {
  let map1: Map<string, string>;
  let map2: Map<string, string>;
  let map3: Map<string, string>;
  let simpleConfigSourceOrdinal1: ConfigSource;
  let simpleConfigSourceOrdinal2: ConfigSource;
  let simpleConfigSourceOrdinal3: SimpleConfigSourceFixture;
  let layeredConfig: LayeredConfig;

  beforeEach(() => {
    map1 = new Map<string, string>();
    map2 = new Map<string, string>();
    map3 = new Map<string, string>();
    map1.set('key1', 'map1key1value1');
    map1.set('key2', 'map1key2value2');
    map1.set('boolean', 'true');
    map1.set('stringArray', '["map1StringArray"]');
    map2.set('key2', 'map2key2value2');
    map2.set('key3', 'map2key2value3');
    map2.set('number', '42');
    map3.set('key3', 'map3key3value3');

    const simpleObject: SimpleObject = new SimpleObject('prop1', 42, true, ['prop4']);
    map2.set('simpleObject', JSON.stringify(simpleObject));
    map1.set('simpleObjectArray', JSON.stringify([simpleObject]));

    simpleConfigSourceOrdinal1 = new SimpleConfigSourceFixture(
      'simpleConfigSource1',
      1,
      'simpleConfigSource1',
      undefined,
      map1,
    );
    simpleConfigSourceOrdinal2 = new SimpleConfigSourceFixture(
      'simpleConfigSource2',
      2,
      'simpleConfigSource2',
      undefined,
      map2,
    );
    simpleConfigSourceOrdinal3 = new SimpleConfigSourceFixture(
      'simpleConfigSource3',
      3,
      'simpleConfigSource3',
      undefined,
      map3,
    );

    layeredConfig = new LayeredConfig([
      simpleConfigSourceOrdinal2,
      simpleConfigSourceOrdinal3,
      simpleConfigSourceOrdinal1,
    ]);
  });

  it('should sort sources by ordinal', () => {
    const propertyMap: Map<string, string> = layeredConfig.properties();
    expect(propertyMap.get('key1')).to.equal('map1key1value1');
    expect(propertyMap.get('key2')).to.equal('map2key2value2');
    expect(propertyMap.get('key3')).to.equal('map3key3value3');
  });

  it('should return the correct property names', () => {
    const propertyNames: Set<string> = layeredConfig.propertyNames();
    expect(propertyNames.has('key1')).to.be.true;
    expect(propertyNames.has('key2')).to.be.true;
    expect(propertyNames.has('key3')).to.be.true;
  });

  it('should return the correct properties after a refresh', async () => {
    const map3: Map<string, string> = new Map<string, string>();
    map3.set('key1', 'map3key1value1');
    map3.set('key2', 'map3key2value2');
    map3.set('key3', 'map3key3value3');
    map3.set('key4', 'map3key4value4');
    simpleConfigSourceOrdinal3.props2 = map3;
    await layeredConfig.refresh();
    const propertyMap: Map<string, string> = layeredConfig.properties();
    expect(propertyMap.get('key1')).to.equal('map3key1value1');
    expect(propertyMap.get('key2')).to.equal('map3key2value2');
    expect(propertyMap.get('key3')).to.equal('map3key3value3');
    expect(propertyMap.get('key4')).to.equal('map3key4value4');
  });

  it('should return as a boolean', () => {
    expect(layeredConfig.asBoolean('boolean')).to.be.true;
  });

  it('should return as a number', () => {
    expect(layeredConfig.asNumber('number')).to.equal(42);
  });

  it('should return as a string', () => {
    expect(layeredConfig.asString('key3')).to.equal('map3key3value3');
  });

  it('should return a string array', () => {
    expect(layeredConfig.asStringArray('stringArray')).to.eql(['map1StringArray']);
  });

  it('should return an object', () => {
    const simpleObject: SimpleObject = layeredConfig.asObject(SimpleObject, 'simpleObject');
    expect(simpleObject.prop1).to.equal('prop1');
    expect(simpleObject.prop2).to.equal(42);
    expect(simpleObject.prop3).to.be.true;
    expect(simpleObject.prop4).to.eql(['prop4']);
  });

  it('should return an object array', () => {
    const simpleObjectArray: SimpleObject[] = layeredConfig.asObjectArray(SimpleObject, 'simpleObjectArray');
    expect(simpleObjectArray[0].prop1).to.equal('prop1');
    expect(simpleObjectArray[0].prop2).to.equal(42);
    expect(simpleObjectArray[0].prop3).to.be.true;
    expect(simpleObjectArray[0].prop4).to.eql(['prop4']);
  });

  it('primitiveScalar should throw IllegalArgumentError', () => {
    // @ts-expect-error - testing private method
    expect(() => layeredConfig.primitiveScalar<string>(layeredConfig.asString, 'key3', null)).to.throw(
      'Unsupported scalar type',
    );
  });
});
