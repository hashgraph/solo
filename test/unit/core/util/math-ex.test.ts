// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import {MathEx} from '../../../../src/core/util/math-ex.js';
import {ArithmeticError} from '../../../../src/core/util/arithmetic-error.js';

describe('MathEx', () => {
  it('testLongExact', () => {
    testLongExactTwice(0, 0);
    testLongExactTwice(1, 1);
    testLongExactTwice(1, -1);
    testLongExactTwice(1000, 2000);

    testLongExactTwice(Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER);
    testLongExactTwice(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    testLongExactTwice(Number.MIN_SAFE_INTEGER, 1);
    testLongExactTwice(Number.MAX_SAFE_INTEGER, 1);
    testLongExactTwice(Number.MIN_SAFE_INTEGER, 2);
    testLongExactTwice(Number.MAX_SAFE_INTEGER, 2);
    testLongExactTwice(Number.MIN_SAFE_INTEGER, -1);
    testLongExactTwice(Number.MAX_SAFE_INTEGER, -1);
    testLongExactTwice(Number.MIN_SAFE_INTEGER, -2);
    testLongExactTwice(Number.MAX_SAFE_INTEGER, -2);
    testLongExactTwice(Math.trunc(Number.MIN_SAFE_INTEGER / 2), 2);
    testLongExactTwice(Math.trunc(Number.MAX_SAFE_INTEGER / 2), 2);
  });

  it('testLongFloorDivMod', () => {
    testLongFloorDivModulo(4, 0, 0, 0, true, true);
    testLongFloorDivModulo(4, 3, 1, 1, false, false);
    testLongFloorDivModulo(3, 3, 1, 0, false, false);
    testLongFloorDivModulo(2, 3, 0, 2, false, false);
    testLongFloorDivModulo(1, 3, 0, 1, false, false);
    testLongFloorDivModulo(0, 3, 0, 0, false, false);
    testLongFloorDivModulo(4, -3, -2, -2, false, false);
    testLongFloorDivModulo(3, -3, -1, 0, false, false);
    testLongFloorDivModulo(2, -3, -1, -1, false, false);
    testLongFloorDivModulo(1, -3, -1, -2, false, false);
    testLongFloorDivModulo(0, -3, 0, 0, false, false);
    testLongFloorDivModulo(-1, 3, -1, 2, false, false);
    testLongFloorDivModulo(-2, 3, -1, 1, false, false);
    testLongFloorDivModulo(-3, 3, -1, 0, false, false);
    testLongFloorDivModulo(-4, 3, -2, 2, false, false);
    testLongFloorDivModulo(-1, -3, 0, -1, false, false);
    testLongFloorDivModulo(-2, -3, 0, -2, false, false);
    testLongFloorDivModulo(-3, -3, 1, 0, false, false);
    testLongFloorDivModulo(-4, -3, 1, -1, false, false);

    testLongFloorDivModulo(Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER, 0, false, false);
    testLongFloorDivModulo(Number.MAX_SAFE_INTEGER, -1, -Number.MAX_SAFE_INTEGER, 0, false, false);
    testLongFloorDivModulo(Number.MAX_SAFE_INTEGER, 3, Math.floor(Number.MAX_SAFE_INTEGER / 3), 1, false, false);
    testLongFloorDivModulo(
      Number.MAX_SAFE_INTEGER - 1,
      3,
      Math.floor(Number.MAX_SAFE_INTEGER - 1) / 3,
      0,
      false,
      false,
    );
    testLongFloorDivModulo(Number.MIN_SAFE_INTEGER, 3, Math.floor(Number.MIN_SAFE_INTEGER / 3), 1, false, false);
    testLongFloorDivModulo(
      Number.MIN_SAFE_INTEGER + 1,
      3,
      Math.floor(Number.MIN_SAFE_INTEGER / 3) + 1,
      0,
      false,
      false,
    );
    testLongFloorDivModulo(Number.MIN_SAFE_INTEGER + 1, -1, Number.MAX_SAFE_INTEGER - 1, 0, false, false);
    // Special case of integer overflow
    testLongFloorDivModulo(Number.MIN_SAFE_INTEGER, -1, Number.MAX_SAFE_INTEGER, 0, false, false);
  });
});

function testLongExact(x: number, y: number) {
  let resultBig: bigint;
  try {
    resultBig = BigInt(x) + BigInt(y);
    const sum = MathEx.addExact(x, y);

    checkResult('addExact', x, y, sum, resultBig);
  } catch (error: ArithmeticError | any) {
    checkError('addExact', x, y, resultBig, error);
  }

  try {
    resultBig = BigInt(x) - BigInt(y);
    const diff = MathEx.subtractExact(x, y);

    checkResult('subtractExact', x, y, diff, resultBig);
  } catch (error: ArithmeticError | any) {
    checkError('subtractExact', x, y, resultBig, error);
  }

  try {
    resultBig = BigInt(x) * BigInt(y);
    const product = MathEx.multiplyExact(x, y);

    checkResult('multiplyExact', x, y, product, resultBig);
  } catch (error: ArithmeticError | any) {
    checkError('multiplyExact', x, y, resultBig, error);
  }
}

function testLongExactTwice(x: number, y: number) {
  testLongExact(x, y);
  testLongExact(y, x);
}

function checkError(message: string, x: number, y: number, resultBig: bigint, error: Error) {
  if (!(error instanceof ArithmeticError)) {
    throw error;
  }

  if (Number.isSafeInteger(Number(resultBig))) {
    expect.fail(`${message}(${x}, ${y}); Unexpected exception: ${error}`);
  }
}

function checkResult(message: string, x: number, y: number, result: number, expected: bigint) {
  const resultBig = BigInt(result);
  const finalMessage = `${message}(${x}, ${y}) = ${result}`;
  if (!Number.isSafeInteger(Number(resultBig))) {
    expect.fail(`${finalMessage}; expected an arithmetic error`);
  } else if (resultBig !== expected) {
    expect.fail(`${finalMessage}; expected ${expected}`);
  }
}

function testLongFloorDivModulo(
  x: number,
  y: number,
  divExpected: number,
  moduloExpected: number,
  divThrows: boolean,
  moduloThrows: boolean,
) {
  testLongFloorDiv(x, y, divExpected, divThrows);
  testLongFloorModulo(x, y, moduloExpected, moduloThrows);
}

function testLongFloorDiv(x: number, y: number, expected: number, shouldThrow: boolean) {
  try {
    const result = MathEx.floorDiv(x, y);
    if (result !== expected) {
      expect.fail(`floorDiv(${x}, ${y}) = ${result}; expected ${expected}`);
    }

    if (shouldThrow) {
      expect.fail(`floorDiv(${x}, ${y}); expected an arithmetic error`);
    }
  } catch (error: ArithmeticError | any) {
    if (!(error instanceof ArithmeticError)) {
      throw error;
    }

    if (!shouldThrow) {
      expect.fail(`floorDiv(${x}, ${y}); Unexpected exception: ${error}`);
    }
  }
}

function testLongFloorModulo(x: number, y: number, expected: number, shouldThrow: boolean) {
  try {
    const result = MathEx.floorModulo(x, y);
    if (result !== expected) {
      expect.fail(`floorMod(${x}, ${y}) = ${result}; expected ${expected}`);
    }

    if (shouldThrow) {
      expect.fail(`floorMod(${x}, ${y}); expected an arithmetic error`);
    }
  } catch (error: ArithmeticError | any) {
    if (!(error instanceof ArithmeticError)) {
      throw error;
    }

    if (error instanceof ArithmeticError && y !== 0) {
      expect.fail(`floorMod(${x}, ${y}); Unexpected arithmetic error: ${error}`);
    }

    if (!shouldThrow) {
      expect.fail(`floorMod(${x}, ${y}); Unexpected exception: ${error}`);
    }
  }
}
