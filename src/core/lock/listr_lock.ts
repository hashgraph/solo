// SPDX-License-Identifier: Apache-2.0

import {type ListrTaskWrapper} from 'listr2';
import chalk from 'chalk';
import {type Lock} from './lock.js';

import {LockAcquisitionError} from './lock_acquisition_error.js';

/**
 * A utility class for managing lock acquisition tasks in Listr2 based workflows.
 */
export class ListrLock {
  /**
   * The default number of attempts to try acquiring the lock before failing.
   */
  public static readonly DEFAULT_LOCK_ACQUIRE_ATTEMPTS = 10;

  /**
   * The title of the lock acquisition task used by Listr2.
   */
  public static readonly ACQUIRE_LOCK_TASK_TITLE = 'Acquire lock';

  /**
   * Prevents instantiation of this utility class.
   */
  private constructor() {
    throw new Error('This class cannot be instantiated');
  }

  /**
   * Creates a new Listr2 task for acquiring a lock with retry logic.
   * @param lock - the lock to be acquired.
   * @param task - the parent task to which the lock acquisition task will be added.
   * @returns a new Listr2 task for acquiring a lock with retry logic.
   */
  public static newAcquireLockTask(lock: Lock, task: ListrTaskWrapper<any, any, any>) {
    return task.newListr(
      [
        {
          title: ListrLock.ACQUIRE_LOCK_TASK_TITLE,
          task: async (_, task) => {
            await ListrLock.acquireWithRetry(lock, task);
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: {
          collapseSubtasks: false,
        },
      },
    );
  }

  /**
   * Acquires a lock with retry logic and appropriate Listr2 status updates. This method is called by the Listr2 task
   * created by the newAcquireLeaseTask() method.
   *
   * @param lock - the lock to be acquired.
   * @param task - the task to be updated with the lock acquisition status.
   * @throws LockAcquisitionError if the lock could not be acquired after the maximum number of attempts or an unexpected error occurred.
   */
  private static async acquireWithRetry(lock: Lock, task: ListrTaskWrapper<any, any, any>): Promise<void> {
    const maxAttempts = +process.env.SOLO_LEASE_ACQUIRE_ATTEMPTS || ListrLock.DEFAULT_LOCK_ACQUIRE_ATTEMPTS;
    const title = task.title;

    let attempt: number;
    let innerError: Error | null = null;
    for (attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await lock.acquire();
        task.title =
          `${title} - ${chalk.green('lock acquired successfully')}` +
          `, attempt: ${chalk.cyan((attempt + 1).toString())}/${chalk.cyan(maxAttempts.toString())}`;
        return;
      } catch (e: LockAcquisitionError | any) {
        task.title =
          `${title} - ${chalk.gray(`lock exists, attempting again in ${lock.durationSeconds} seconds`)}` +
          `, attempt: ${chalk.cyan((attempt + 1).toString())}/${chalk.cyan(maxAttempts.toString())}`;

        if (attempt >= maxAttempts) {
          innerError = e;
        }
      }
    }

    task.title =
      `${title} - ${chalk.red('failed to acquire lock, max attempts reached!')}` +
      `, attempt: ${chalk.cyan(attempt.toString())}/${chalk.cyan(maxAttempts.toString())}`;

    throw new LockAcquisitionError(
      `Failed to acquire lock, max attempts reached (${attempt + 1}/${maxAttempts})`,
      innerError,
    );
  }
}
