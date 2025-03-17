// SPDX-License-Identifier: Apache-2.0

import {HelmExecution} from '../../../../../src/core/helm/execution/HelmExecution.js';
import {HelmExecutionException} from '../../../../../src/core/helm/HelmExecutionException.js';
import {HelmParserException} from '../../../../../src/core/helm/HelmParserException.js';
import {Repository} from '../../../../../src/core/helm/model/Repository.js';
import {jest} from '@jest/globals';

describe('HelmExecution', () => {
  let processMock: jest.Mocked<NodeJS.Process>;
  let inputStreamMock: jest.Mocked<NodeJS.ReadableStream>;

  beforeEach(() => {
    processMock = {
      stdin: null as any,
      stdout: null as any,
      stderr: null as any,
      kill: jest.fn(),
      pid: 1,
    } as any;

    inputStreamMock = {
      on: jest.fn(),
      pipe: jest.fn(),
      read: jest.fn(),
    } as any;

    processMock.stdout = inputStreamMock;
    processMock.stderr = inputStreamMock;
  });

  describe('call', () => {
    it('should throw exception and log warning message when call fails', async () => {
      const helmExecution = new HelmExecution(processMock);
      jest.spyOn(helmExecution as any, 'exitCode').mockResolvedValue(1);
      jest.spyOn(helmExecution as any, 'waitFor').mockResolvedValue(true);
      jest.spyOn(helmExecution as any, 'standardOutput').mockReturnValue(inputStreamMock);
      jest.spyOn(helmExecution as any, 'standardError').mockReturnValue(inputStreamMock);

      const timeout = 1000; // 1 second

      await expect(async () => {
        await helmExecution.call(timeout);
      }).rejects.toThrow(HelmExecutionException);

      await expect(async () => {
        await helmExecution.call(timeout);
      }).rejects.toThrow('Execution of the Helm command failed with exit code: 1');
    });
  });

  describe('responseAsList', () => {
    it('should throw exception and log warning message when deserialization fails', async () => {
      const helmExecution = new HelmExecution(processMock);
      jest.spyOn(helmExecution as any, 'exitCode').mockResolvedValue(0);
      jest.spyOn(helmExecution as any, 'waitFor').mockResolvedValue(true);
      jest.spyOn(helmExecution as any, 'standardOutput').mockReturnValue(inputStreamMock);
      jest.spyOn(helmExecution as any, 'standardError').mockReturnValue(inputStreamMock);

      const timeout = 1000; // 1 second

      await expect(async () => {
        await helmExecution.responseAsList(Repository, timeout);
      }).rejects.toThrow(HelmParserException);

      await expect(async () => {
        await helmExecution.responseAsList(Repository, timeout);
      }).rejects.toThrow('Failed to deserialize the output into a list of the specified class');
    });
  });

  describe('responseAs', () => {
    it('should throw exception and log warning message when deserialization fails', async () => {
      const helmExecution = new HelmExecution(processMock);
      jest.spyOn(helmExecution as any, 'exitCode').mockResolvedValue(0);
      jest.spyOn(helmExecution as any, 'waitFor').mockResolvedValue(true);
      jest.spyOn(helmExecution as any, 'standardOutput').mockReturnValue(inputStreamMock);
      jest.spyOn(helmExecution as any, 'standardError').mockReturnValue(inputStreamMock);

      const timeout = 1000; // 1 second

      await expect(async () => {
        await helmExecution.responseAs(Repository, timeout);
      }).rejects.toThrow(HelmParserException);

      await expect(async () => {
        await helmExecution.responseAs(Repository, timeout);
      }).rejects.toThrow('Failed to deserialize the output into the specified class');
    });

    it('should throw HelmExecutionException with standard error and standard out', async () => {
      const helmExecution = new HelmExecution(processMock);
      jest.spyOn(helmExecution as any, 'exitCode').mockResolvedValue(1);
      jest.spyOn(helmExecution as any, 'waitFor').mockResolvedValue(true);

      const standardOutputMessage = 'standardOutput Message';
      const standardErrorMessage = 'standardError Message';

      const mockStdout = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(standardOutputMessage));
          controller.close();
        },
      });

      const mockStderr = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(standardErrorMessage));
          controller.close();
        },
      });

      jest.spyOn(helmExecution as any, 'standardOutput').mockReturnValue(mockStdout);
      jest.spyOn(helmExecution as any, 'standardError').mockReturnValue(mockStderr);

      const timeout = 1000; // 1 second

      try {
        await helmExecution.responseAs(Repository, timeout);
        fail('Expected HelmExecutionException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HelmExecutionException);
        expect(error.message).toContain('Execution of the Helm command failed with exit code: 1');
        expect(error.stdOut).toContain(standardOutputMessage);
        expect(error.stdErr).toContain(standardErrorMessage);
      }
    });
  });
});
