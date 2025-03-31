// SPDX-License-Identifier: Apache-2.0

/**
 * The response from the helm repo commands.
 */
export class Repository {
  /**
   * Constructs a new Repository.
   *
   * @param name the name of the repository.
   * @param url  the url of the repository.
   * @throws Error if any of the arguments are null or blank.
   */
  constructor(
    public readonly name: string,
    public readonly url: string,
  ) {
    if (!name) {
      throw new Error('name must not be null');
    }
    if (!url) {
      throw new Error('url must not be null');
    }

    if (!name.trim()) {
      throw new Error('name must not be blank');
    }

    if (!url.trim()) {
      throw new Error('url must not be blank');
    }
  }
}
