// SPDX-License-Identifier: Apache-2.0

import {type ListrTaskWrapper} from 'listr2';
import chalk from 'chalk';
import {type LeaseService} from './lease_service.js';
import {LeaseAcquisitionError} from './lease_errors.js';

/**
 * A utility class for managing lease acquisition tasks in Listr2 based workflows.
 */
export class ListrLease {
  /**
   * The default number of attempts to try acquiring the lease before failing.
   */
  public static readonly DEFAULT_LEASE_ACQUIRE_ATTEMPTS = 10;

  /**
   * The title of the lease acquisition task used by Listr2.
   */
  public static readonly ACQUIRE_LEASE_TASK_TITLE = 'Acquire lease';

  /**
   * Prevents instantiation of this utility class.
   */
  private constructor() {
    throw new Error('This class cannot be instantiated');
  }

  /**
   * Creates a new Listr2 task for acquiring a lease with retry logic.
   * @param lease - the lease to be acquired.
   * @param task - the parent task to which the lease acquisition task will be added.
   * @returns a new Listr2 task for acquiring a lease with retry logic.
   */
  public static newAcquireLeaseTask(lease: LeaseService, task: ListrTaskWrapper<any, any, any>) {
    return task.newListr(
      [
        {
          title: ListrLease.ACQUIRE_LEASE_TASK_TITLE,
          task: async (_, task) => {
            await ListrLease.acquireWithRetry(lease, task);
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
   * Acquires a lease with retry logic and appropriate Listr2 status updates. This method is called by the Listr2 task
   * created by the newAcquireLeaseTask() method.
   *
   * @param lease - the lease to be acquired.
   * @param task - the task to be updated with the lease acquisition status.
   * @throws LeaseAcquisitionError if the lease could not be acquired after the maximum number of attempts or an unexpected error occurred.
   */
  private static async acquireWithRetry(lease: LeaseService, task: ListrTaskWrapper<any, any, any>): Promise<void> {
    const maxAttempts = +process.env.SOLO_LEASE_ACQUIRE_ATTEMPTS || ListrLease.DEFAULT_LEASE_ACQUIRE_ATTEMPTS;
    const title = task.title;

    let attempt: number;
    let innerError: Error | null = null;
    for (attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await lease.acquire();
        task.title =
          `${title} - ${chalk.green('lease acquired successfully')}` +
          `, attempt: ${chalk.cyan((attempt + 1).toString())}/${chalk.cyan(maxAttempts.toString())}`;
        return;
      } catch (e: LeaseAcquisitionError | any) {
        task.title =
          `${title} - ${chalk.gray(`lease exists, attempting again in ${lease.durationSeconds} seconds`)}` +
          `, attempt: ${chalk.cyan((attempt + 1).toString())}/${chalk.cyan(maxAttempts.toString())}`;

        if (attempt >= maxAttempts) {
          innerError = e;
        }
      }
    }

    task.title =
      `${title} - ${chalk.red('failed to acquire lease, max attempts reached!')}` +
      `, attempt: ${chalk.cyan(attempt.toString())}/${chalk.cyan(maxAttempts.toString())}`;

    throw new LeaseAcquisitionError(
      `Failed to acquire lease, max attempts reached (${attempt + 1}/${maxAttempts})`,
      innerError,
    );
  }
}
