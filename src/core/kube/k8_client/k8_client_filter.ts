/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {MissingArgumentError, SoloError} from '../../errors.js';

/**
 * The abstract K8 Client Filter adds the `filterItem` method to the class that extends it.
 */
export abstract class K8ClientFilter {
  /**
   * Apply filters to metadata
   * @param items - list of items
   * @param [filters] - an object with metadata fields and value
   * @returns a list of items that match the filters
   * @throws MissingArgumentError - filters are required
   */
  private applyMetadataFilter(items: (object | any)[], filters: Record<string, string> = {}) {
    if (!filters) throw new MissingArgumentError('filters are required');

    const matched = [];
    const filterMap = new Map(Object.entries(filters));
    for (const item of items) {
      // match all filters
      let foundMatch = true;
      for (const entry of filterMap.entries()) {
        const field = entry[0];
        const value = entry[1];

        if (item.metadata[field] !== value) {
          foundMatch = false;
          break;
        }
      }

      if (foundMatch) {
        matched.push(item);
      }
    }

    return matched;
  }

  /**
   * Filter a single item using metadata filter
   * @param items - list of items
   * @param [filters] - an object with metadata fields and value
   * @throws SoloError - multiple items found with filters
   * @throws MissingArgumentError - filters are required
   */
  protected filterItem(items: (object | any)[], filters: Record<string, string> = {}) {
    const filtered = this.applyMetadataFilter(items, filters);
    if (filtered.length > 1) throw new SoloError('multiple items found with filters', {filters});
    return filtered[0];
  }
}
