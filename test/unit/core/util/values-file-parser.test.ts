// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {ValuesFileParser} from '../../../../src/core/util/values-file-parser.js';
import {ValuesFileParseFailedSoloError} from '../../../../src/core/errors/classes/validation/values-file-parse-failed-solo-error.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';

describe('Values file parser', (): void => {
  const valuesFilePath: string = '/home/user/.solo/values-files/stale-values.yaml';

  it('should parse a valid values file into an object', (): void => {
    const parsed: unknown = ValuesFileParser.parse(
      valuesFilePath,
      'hedera:\n  nodes:\n    - name: node1\n      nodeId: 0\n',
    );

    expect(parsed).to.deep.equal({hedera: {nodes: [{name: 'node1', nodeId: 0}]}});
  });

  it('should return null for an empty values file', (): void => {
    expect(ValuesFileParser.parse(valuesFilePath, '')).to.be.null;
  });

  it('should parse a JSON values file however it is formatted', (): void => {
    const expected: object = {hedera: {nodes: [{name: 'node1', nodeId: 0}]}};

    expect(ValuesFileParser.parse(valuesFilePath, JSON.stringify(expected))).to.deep.equal(expected);
    expect(ValuesFileParser.parse(valuesFilePath, JSON.stringify(expected, undefined, 2))).to.deep.equal(expected);
    expect(ValuesFileParser.parse(valuesFilePath, JSON.stringify(expected, undefined, '\t'))).to.deep.equal(expected);
    expect(ValuesFileParser.parse(valuesFilePath, `\n  ${JSON.stringify(expected)}`)).to.deep.equal(expected);
  });

  it('should parse a JSON values file that starts with a byte-order mark', (): void => {
    expect(ValuesFileParser.parse(valuesFilePath, '﻿{"hedera":{"nodeId":0}}')).to.deep.equal({
      hedera: {nodeId: 0},
    });
  });

  it('should reject malformed JSON instead of silently parsing it as YAML', (): void => {
    // YAML accepts these and yields a different object graph — '{a:1}' becomes the single key 'a:1'.
    for (const malformedContent of ['{"a":1,}', '{a:1}', "{'a':1}", '{"a":NaN}']) {
      expect((): unknown => ValuesFileParser.parse(valuesFilePath, malformedContent)).to.throw(
        ValuesFileParseFailedSoloError,
      );
    }
  });

  it('should throw a typed Solo error naming the file when the values file is unparseable', (): void => {
    let thrownError: ValuesFileParseFailedSoloError | undefined;

    try {
      ValuesFileParser.parse(valuesFilePath, 'hedera:\n  nodes:\n  - name: node1\n   nodeId: 0\n');
    } catch (error) {
      thrownError = error as ValuesFileParseFailedSoloError;
    }

    expect(thrownError).to.be.instanceof(ValuesFileParseFailedSoloError);
    expect(thrownError).to.be.instanceof(SoloError);
    expect(thrownError.message).to.contain(valuesFilePath);
    expect(thrownError.getFormattedCode()).to.equal('SOLO-4079');
    expect(thrownError.cause).to.be.instanceof(Error);
  });

  it('should tell the user that a values file starting with a brace is held to JSON rules', (): void => {
    let thrownError: ValuesFileParseFailedSoloError | undefined;

    try {
      ValuesFileParser.parse(valuesFilePath, '{hedera: {nodeId: 0}}');
    } catch (error) {
      thrownError = error as ValuesFileParseFailedSoloError;
    }

    const troubleshootingSteps: ReadonlyArray<string> = thrownError.getTroubleshootingSteps() ?? [];
    expect(troubleshootingSteps.join('\n')).to.contain('parsed as strict JSON');
  });

  it('should tell the user how to regenerate the offending values file', (): void => {
    let thrownError: ValuesFileParseFailedSoloError | undefined;

    try {
      ValuesFileParser.parse(valuesFilePath, '{not: valid');
    } catch (error) {
      thrownError = error as ValuesFileParseFailedSoloError;
    }

    const troubleshootingSteps: ReadonlyArray<string> = thrownError.getTroubleshootingSteps() ?? [];
    expect(troubleshootingSteps.join('\n')).to.contain(`rm ${valuesFilePath}`);
  });
});
