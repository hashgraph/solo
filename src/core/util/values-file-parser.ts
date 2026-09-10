// SPDX-License-Identifier: Apache-2.0

import yaml from 'yaml';
import {ValuesFileParseFailedSoloError} from '../errors/classes/validation/values-file-parse-failed-solo-error.js';

/**
 * Single entry point for turning Helm values file content into an object graph.
 *
 * Every values file solo reads — user supplied via `--values-file` or cached under the solo home directory — must be
 * parsed through here so that an unparseable file fails the command with a coded error naming the offending path
 * instead of being silently ignored or handed to Helm as-is.
 */
export class ValuesFileParser {
  /**
   * Parses the content of a values file as JSON when it opens with `{`, and as YAML otherwise.
   *
   * YAML would parse JSON either way, but it also accepts sloppy JSON — unquoted keys, trailing commas,
   * bare `NaN` — and silently yields a different object graph (`{a:1}` becomes the single key `'a:1'`).
   * Holding a JSON file to JSON's rules fails it instead of handing Helm values the user never wrote.
   *
   * @param valuesFilePath - path the content was read from; reported in the error so the user knows which file to fix
   * @param content - raw file content
   * @returns the parsed document, which is `null` for an empty file
   * @throws ValuesFileParseFailedSoloError when the content is neither valid JSON nor valid YAML
   */
  public static parse(valuesFilePath: string, content: string): unknown {
    // Trimmed because JSON.parse rejects the leading byte-order mark that Windows editors emit.
    const trimmedContent: string = content.trimStart();

    try {
      return trimmedContent.startsWith('{') ? JSON.parse(trimmedContent) : yaml.parse(content);
    } catch (error) {
      throw new ValuesFileParseFailedSoloError(valuesFilePath, error as Error);
    }
  }
}
