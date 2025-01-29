/**
 * Copyright (C) 2025 Hedera Hashgraph, LLC
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
import {describe, it} from 'mocha';
import {expect} from 'chai';
import {Duration} from '../../../../src/core/time/duration.js';

describe('Duration', () => {
  describe('Java TCK', () => {
    it('plus zero returns this', () => {
      const t = Duration.ofSeconds(-1);
      expect(t.plus(Duration.ZERO)).to.equal(t);
    });

    it('plus zero singleton', () => {
      const t = Duration.ofSeconds(-1);
      expect(t.plus(Duration.ofSeconds(1))).to.equal(Duration.ZERO);
    });

    it('plusSeconds zero returns this', () => {
      const t = Duration.ofSeconds(-1);
      expect(t.plusSeconds(0)).to.equal(t);
    });

    it('plusSeconds zero singleton', () => {
      const t = Duration.ofSeconds(-1);
      expect(t.plusSeconds(1)).to.equal(Duration.ZERO);
    });

    it('plusMillis zero returns this', () => {
      const t = Duration.ofSeconds(-1);
      expect(t.plusMillis(0)).to.equal(t);
    });

    it('plusMillis zero singleton', () => {
      const t = Duration.ofMillis(-1);
      expect(t.plusMillis(1)).to.equal(Duration.ZERO);
    });

    it('plusNanos zero returns this', () => {
      const t = Duration.ofSeconds(-1);
      expect(t.plusNanos(0)).to.equal(t);
    });

    it('plusNanos zero singleton', () => {
      const t = Duration.ofNanos(-1);
      expect(t.plusNanos(1)).to.equal(Duration.ZERO);
    });

    it('minus zero returns this', () => {
      const t = Duration.ofSeconds(-1);
      expect(t.minus(Duration.ZERO)).to.equal(t);
    });

    it('minus zero singleton', () => {
      const t = Duration.ofSeconds(1);
      expect(t.minus(Duration.ofSeconds(1))).to.equal(Duration.ZERO);
    });

    it('minusSeconds zero returns this', () => {
      const t = Duration.ofSeconds(-1);
      expect(t.minusSeconds(0)).to.equal(t);
    });

    it('minusSeconds zero singleton', () => {
      const t = Duration.ofSeconds(1);
      expect(t.minusSeconds(1)).to.equal(Duration.ZERO);
    });

    it('minusMillis zero returns this', () => {
      const t = Duration.ofSecondsAdjusted(1, 2_000_000);
      expect(t.minusMillis(0)).to.equal(t);
    });

    it('minusMillis zero singleton', () => {
      const t = Duration.ofSecondsAdjusted(1, 2_000_000);
      expect(t.minusMillis(1002)).to.equal(Duration.ZERO);
    });

    it('minusNanos zero returns this', () => {
      const t = Duration.ofSecondsAdjusted(1, 2_000_000);
      expect(t.minusNanos(0)).to.equal(t);
    });

    it('minusNanos zero singleton', () => {
      const t = Duration.ofSecondsAdjusted(1, 2_000_000);
      expect(t.minusNanos(1_002_000_000)).to.equal(Duration.ZERO);
    });
  });
});
