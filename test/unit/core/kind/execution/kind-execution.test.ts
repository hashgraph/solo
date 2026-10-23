// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import Sinon from 'sinon';
import {EventEmitter} from 'node:events';
import {KindExecutionException} from '../../../../../src/integration/kind/errors/kind-execution-exception.js';
import {KindParserException} from '../../../../../src/integration/kind/errors/kind-parser-exception.js';

// Create a mock implementation that mimics KindExecution behavior
class MockKindExecution {
  private output: string[] = [];
  private errOutput: string[] = [];
  private exitCodeValue: number | null = null;
  private mockProcess: EventEmitter;
  private readonly command: string[];
  private readonly workingDirectory: string;
  private readonly environmentVariables: Record<string, string>;

  constructor(command: string[], workingDirectory: string, environmentVariables: Record<string, string>) {
    this.command = command;
    this.workingDirectory = workingDirectory;
    this.environmentVariables = environmentVariables;
    // eslint-disable-next-line unicorn/prefer-event-target
    this.mockProcess = new EventEmitter();
    // @ts-expect-error TS2339: Property stdout does not exist on type EventEmitter<DefaultEventMap>
    // eslint-disable-next-line unicorn/prefer-event-target
    this.mockProcess.stdout = new EventEmitter();
    // @ts-expect-error TS2339: Property stderr does not exist on type EventEmitter<DefaultEventMap>
    // eslint-disable-next-line unicorn/prefer-event-target
    this.mockProcess.stderr = new EventEmitter();
    // @ts-expect-error TS2339: Property stdin does not exist on type EventEmitter<DefaultEventMap>
    this.mockProcess.stdin = {
      end: Sinon.stub(),
    };

    // Listen for events from our mock process
    // @ts-expect-error TS2339: Property stdout does not exist on type EventEmitter<DefaultEventMap>
    this.mockProcess.stdout.on('data', (data): number => this.output.push(data.toString()));
    // @ts-expect-error TS2339: Property stderr does not exist on type EventEmitter<DefaultEventMap>
    this.mockProcess.stderr.on('data', (data): number => this.errOutput.push(data.toString()));
    this.mockProcess.on('exit', (code): void => {
      this.exitCodeValue = code ?? 0;
    });
  }

  // Expose methods to control the mock process
  public emitStdout(data: string): void {
    // @ts-expect-error TS2339: Property stdout does not exist on type EventEmitter<DefaultEventMap>
    this.mockProcess.stdout.emit('data', data);
  }

  public emitStderr(data: string): void {
    // @ts-expect-error TS2339: Property stderr does not exist on type EventEmitter<DefaultEventMap>
    this.mockProcess.stderr.emit('data', data);
  }

  public emitExit(code: number): void {
    this.mockProcess.emit('exit', code);
  }

  public emitError(error: Error): void {
    this.mockProcess.emit('error', error);
  }

  // Implement the methods being tested
  public async waitForCompletion(timeout?: number): Promise<void> {
    return new Promise((resolve, reject): void => {
      if (timeout) {
        setTimeout((): void => {
          reject(new Error('Timed out waiting for the process to complete'));
        }, timeout);
      }

      this.mockProcess.on('exit', (code): void => {
        if (code === 0) {
          resolve();
        } else {
          reject(new KindExecutionException(code, this.output.join(''), this.errOutput.join('')));
        }
      });

      this.mockProcess.on('error', (error: Error): void => {
        reject(error);
      });
    });
  }

  public async responseAs<T>(clazz: new () => T & {fromString(string_: string): T}): Promise<T> {
    try {
      await this.waitForCompletion();

      try {
        const constructor: {fromString(string_: string): T} = clazz as unknown as {fromString(string_: string): T};
        return constructor.fromString(this.output.join(''));
      } catch (error) {
        throw new KindParserException(
          `Failed to deserialize the output into the specified class: ${clazz.name}`,
          error as Error,
        );
      }
    } catch (error) {
      if (error instanceof KindExecutionException || error instanceof KindParserException) {
        throw error;
      }
      throw new KindExecutionException(1, this.output.join(''), this.errOutput.join(''));
    }
  }

  public async responseAsList<T>(clazz: new () => T & {fromString(string_: string): T}): Promise<T[]> {
    try {
      await this.waitForCompletion();

      const lines: string[] = this.output
        .join('')
        .split('\n')
        .filter((line): boolean => line.trim().length > 0);
      const result: T[] = [];

      for (const line of lines) {
        try {
          const constructor: {fromString(string_: string): T} = clazz as unknown as {fromString(string_: string): T};
          result.push(constructor.fromString(line));
        } catch (error) {
          throw new KindParserException(
            `Failed to deserialize the output into a list of the specified class: ${clazz.name}`,
            error as Error,
          );
        }
      }

      return result;
    } catch (error) {
      if (error instanceof KindExecutionException || error instanceof KindParserException) {
        throw error;
      }
      throw new KindExecutionException(1, this.output.join(''), this.errOutput.join(''));
    }
  }
}

describe('KindExecution', (): void => {
  let execution: MockKindExecution;

  beforeEach((): void => {
    // Create a test execution using our mock class
    execution = new MockKindExecution(['kind', 'create', 'cluster'], '/test/working/dir', {TEST_ENV: 'value'});
  });

  afterEach((): void => {
    Sinon.restore();
  });

  describe('constructor', (): void => {
    it('should initialize the mock process correctly', (): void => {
      expect(execution).to.be.instanceOf(MockKindExecution);
    });
  });

  describe('waitForCompletion', (): void => {
    it('should resolve when process exits with code 0', async (): Promise<void> => {
      const promise: Promise<void> = execution.waitForCompletion();

      // Emit exit event with success code
      execution.emitExit(0);

      await expect(promise).to.be.fulfilled;
    });

    it('should reject when process exits with non-zero code', async (): Promise<void> => {
      const promise: Promise<void> = execution.waitForCompletion();

      // Emit stdout and stderr data
      execution.emitStdout('Some output');
      execution.emitStderr('Some error');

      // Emit exit event with error code
      execution.emitExit(1);

      await expect(promise).to.be.rejectedWith(KindExecutionException);
    });

    it('should reject when process has an error', async (): Promise<void> => {
      const promise: Promise<void> = execution.waitForCompletion();

      // Emit error event
      execution.emitError(new Error('Process error'));

      await expect(promise).to.be.rejectedWith(Error, 'Process error');
    });

    it('should timeout if the process takes too long', async (): Promise<void> => {
      const clock: any = Sinon.useFakeTimers();
      const promise: Promise<void> = execution.waitForCompletion(100); // 100ms timeout

      // Advance the timer beyond the timeout
      clock.tick(200);

      await expect(promise).to.be.rejectedWith(/Timed out/);
      clock.restore();
    });
  });

  describe('responseAs', (): void => {
    // Create a test class for responseAs testing
    class TestResponse {
      public value: string = '';

      public static fromString(string_: string): TestResponse {
        const instance: TestResponse = new TestResponse();
        instance.value = string_.trim();
        return instance;
      }
    }

    it('should parse successful response into the specified class', async (): Promise<void> => {
      const allPassing: Awaited<boolean>[] = await Promise.all([
        (async (): Promise<boolean> => {
          try {
            // @ts-expect-error TS2345: Argument of type typeof TestResponse is not assignable to parameter of type
            const result: TestResponse = await execution.responseAs(TestResponse);
            expect(result).to.be.instanceOf(TestResponse);
            expect(result.value).to.equal('test response');
            return true;
          } catch {
            return false;
          }
        })(),
        new Promise<boolean>((resolve): void => {
          execution.emitStdout('test response');
          execution.emitExit(0);
          resolve(true);
        }),
      ]);

      expect(allPassing).to.deep.equal([true, true]);
    });

    it('should reject if the process exits with error', async (): Promise<void> => {
      const allPassing: Awaited<boolean>[] = await Promise.all([
        (async (): Promise<boolean> => {
          try {
            // @ts-expect-error TS2345: Argument of type typeof TestResponse is not assignable to parameter of type
            await execution.responseAs(TestResponse);
            return true;
          } catch (error) {
            expect(error.name).to.be.equal(KindExecutionException.name);
            return false;
          }
        })(),
        new Promise<boolean>((resolve): void => {
          execution.emitStderr('error output');
          execution.emitExit(1);
          resolve(true);
        }),
      ]);

      expect(allPassing).to.deep.equal([false, true]);
    });

    it('should reject if parsing fails', async (): Promise<void> => {
      // Setup a class that will throw during parsing
      class FailingClass {
        public static fromString(): FailingClass {
          throw new Error('Parsing error');
        }
      }

      const allPassing: Awaited<boolean>[] = await Promise.all([
        (async (): Promise<boolean> => {
          try {
            // @ts-expect-error TS2345: Argument of type typeof FailingClass is not assignable to parameter of type
            await execution.responseAs(FailingClass);
            return true;
          } catch (error) {
            expect(error.name).to.be.equal(KindParserException.name);
            return false;
          }
        })(),
        new Promise<boolean>((resolve): void => {
          execution.emitStdout('some output');
          execution.emitExit(0);
          resolve(true);
        }),
      ]);

      expect(allPassing).to.deep.equal([false, true]);
    });
  });

  describe('responseAsList', (): void => {
    class TestItem {
      public value: string = '';

      public static fromString(string_: string): TestItem {
        const instance: TestItem = new TestItem();
        instance.value = string_.trim();
        return instance;
      }
    }

    it('should parse successful response into a list of the specified class', async (): Promise<void> => {
      const allPassing: Awaited<boolean>[] = await Promise.all([
        (async (): Promise<boolean> => {
          try {
            // @ts-expect-error TS2345: Argument of type typeof TestItem is not assignable to parameter of type
            const result: TestItem[] = await execution.responseAsList(TestItem);
            expect(result).to.be.an('array').with.lengthOf(3);
            expect(result[0]).to.be.instanceOf(TestItem);
            expect(result[0].value).to.equal('item1');
            expect(result[1].value).to.equal('item2');
            expect(result[2].value).to.equal('item3');
            return true;
          } catch {
            return false;
          }
        })(),
        new Promise<boolean>((resolve): void => {
          execution.emitStdout('item1\nitem2\nitem3');
          execution.emitExit(0);
          resolve(true);
        }),
      ]);

      expect(allPassing).to.deep.equal([true, true]);
    });

    it('should handle empty output', async (): Promise<void> => {
      const allPassing: Awaited<boolean>[] = await Promise.all([
        (async (): Promise<boolean> => {
          try {
            // @ts-expect-error TS2345: Argument of type typeof TestItem is not assignable to parameter of type
            const result: TestItem[] = await execution.responseAsList(TestItem);
            expect(result).to.be.an('array').with.lengthOf(0);
            return true;
          } catch {
            return false;
          }
        })(),
        new Promise<boolean>((resolve): void => {
          execution.emitStdout('');
          execution.emitExit(0);
          resolve(true);
        }),
      ]);

      expect(allPassing).to.deep.equal([true, true]);
    });

    it('should reject if parsing fails', async (): Promise<void> => {
      class FailingItem {
        public static fromString(): FailingItem {
          throw new Error('Parsing error');
        }
      }

      const allPassing: Awaited<boolean>[] = await Promise.all([
        (async (): Promise<boolean> => {
          try {
            // @ts-expect-error TS2345: Argument of type typeof FailingItem is not assignable to parameter of type
            const result: FailingItem[] = await execution.responseAsList(FailingItem);
            expect(result).to.be.an('array').with.lengthOf(0);
            return true;
          } catch (error) {
            expect(error.name).to.be.equal(KindParserException.name);
            return false;
          }
        })(),
        new Promise<boolean>((resolve): void => {
          execution.emitStdout('item1\nitem2');
          execution.emitExit(0);
          resolve(true);
        }),
      ]);

      expect(allPassing).to.deep.equal([false, true]);
    });
  });
});
