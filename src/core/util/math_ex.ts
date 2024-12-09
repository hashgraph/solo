/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import {ArithmeticError} from './arithmetic_error.js';

/**
 * Utility class for performing exact arithmetic operations with overflow checking.
 */
export class MathEx {
  /**
   * Prevents instantiation of this utility class.
   */
  private constructor() {
    throw new Error('This class cannot be instantiated');
  }

  /**
   * Returns the sum of the two arguments; throwing an exception if the result overflows a long integer.
   *
   * @param x - The first value
   * @param y - The second value
   * @returns The result of adding the two values
   * @throws ArithmeticError if the result overflows a long integer
   */
  public static addExact(x: number, y: number): number {
    const r = Math.trunc(x) + Math.trunc(y);
    if (((x ^ r) & (y ^ r)) < 0 || !Number.isSafeInteger(r)) {
      throw new ArithmeticError('Addition overflows a long integer');
    }
    return r;
  }

  /**
   * Returns the difference of the two arguments; throwing an exception if the result overflows a long integer.
   *
   * @param x - The first value
   * @param y - The second value
   * @returns The result of subtracting the two values
   * @throws ArithmeticError if the result overflows a long integer
   */
  public static subtractExact(x: number, y: number): number {
    const r = Math.trunc(x) - Math.trunc(y);
    if (((x ^ y) & (x ^ r)) < 0 || !Number.isSafeInteger(r)) {
      throw new ArithmeticError('Subtraction overflows a long integer');
    }
    return r;
  }

  /**
   * Returns the product of the two arguments; throwing an exception if the result overflows a long integer.
   *
   * @param x - The first value
   * @param y - The second value
   * @returns The result of multiplying the two values
   * @throws ArithmeticError if the result overflows a long integer
   */
  public static multiplyExact(x: number, y: number): number {
    const r = Math.trunc(x) * Math.trunc(y);
    const ax = Math.abs(x);
    const ay = Math.abs(y);

    if ((ax | ay) >>> 31 !== 0) {
      if ((y !== 0 && r / y !== x) || !Number.isSafeInteger(r)) {
        throw new ArithmeticError('Multiplication overflows a long integer');
      }
    }
    return r;
  }

  /**
   * Returns the floor division of the two arguments; throwing an exception if the result overflows a long integer.
   *
   * @param x - The dividend
   * @param y - The divisor
   * @returns The quotient of dividing the two values rounded towards positive infinity.
   */
  public static floorDiv(x: number, y: number): number {
    let r = Math.trunc(x) / Math.trunc(y);

    if (Number.isNaN(r)) {
      throw new ArithmeticError('Division by zero');
    }

    if (!Number.isFinite(r)) {
      throw new ArithmeticError('Division overflows a long integer');
    }

    r = Math.floor(r);

    return r;
  }

  /**
   * Returns the remainder of the floor division of the two arguments; throwing an exception if the result overflows a long integer.
   *
   * @param x - The dividend
   * @param y - The divisor
   * @returns The remainder of dividing the two values rounded towards positive infinity.
   */
  public static floorMod(x: number, y: number): number {
    const dy = Math.trunc(MathEx.floorDiv(x, y) * Math.trunc(y));
    return Math.trunc(x) - dy;
  }
}