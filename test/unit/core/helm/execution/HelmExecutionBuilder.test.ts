// SPDX-License-Identifier: Apache-2.0

import {HelmExecutionBuilder} from '../../../../../src/core/helm/execution/HelmExecutionBuilder.js';

describe('HelmExecutionBuilder', () => {
  describe('optionsWithMultipleValues', () => {
    it('should throw error when option name is null', () => {
      const builder = new HelmExecutionBuilder('.');
      expect(() => {
        builder.optionsWithMultipleValues(null as any, null as any);
      }).toThrow();
    });

    it('should throw error when values are null', () => {
      const builder = new HelmExecutionBuilder('.');
      expect(() => {
        builder.optionsWithMultipleValues('test string', null as any);
      }).toThrow();
    });
  });

  describe('environmentVariable', () => {
    it('should throw error when name is null', () => {
      const builder = new HelmExecutionBuilder('.');
      expect(() => {
        builder.environmentVariable(null as any, null as any);
      }).toThrow();
    });

    it('should throw error when value is null', () => {
      const builder = new HelmExecutionBuilder('.');
      expect(() => {
        builder.environmentVariable('test string', null as any);
      }).toThrow();
    });
  });

  describe('workingDirectory', () => {
    it('should throw error when directory is null', () => {
      const builder = new HelmExecutionBuilder('.');
      expect(() => {
        builder.workingDirectory(null as any);
      }).toThrow();
    });
  });
});
