// SPDX-License-Identifier: Apache-2.0

import path from 'path';
import {SoloError} from '../errors/solo-error.js';
import fs from 'fs';

export class PathEx {
  /**
   * This method requires that the path to a directory or file is real and exists.
   *
   * This method is not safe.  Use this instead of path.join(...) directly when you cannot confine a user to a base
   * directory. It is best to avoid using user input directly for constructing paths. If you must use user input, it is
   * recommended  to use `PathEx.safeJoinWithBaseDirConfinement(...)` to join paths.
   *
   * For more information see: https://owasp.org/www-community/attacks/Path_Traversal
   * @param paths - The paths to join
   */
  public static joinWithRealPath(...paths: string[]): string {
    return fs.realpathSync(path.join(...paths));
  }

  /**
   * Securely joins paths while preventing path traversal attacks. Requires that the base directory is real and exists.
   * This method requires that the path to a directory or file is real and exists.
   *
   * @param baseDir - The base directory to enforce
   * @param paths - The paths to join
   * @throws Error if the resolved path is outside the base directory.
   * @returns The safely joined path.
   */
  public static safeJoinWithBaseDirConfinement(baseDir: string, ...paths: string[]): string {
    const resolvedBase: string = fs.realpathSync(baseDir); // Ensure baseDir is absolute
    const resolvedPath: string = fs.realpathSync(path.resolve(resolvedBase, ...paths)); // Resolve the user path

    if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
      throw new SoloError(`Path traversal detected: ${resolvedPath} is outside ${resolvedBase}`);
    }

    return resolvedPath;
  }

  /**
   * This method requires that the path to a directory or file is real and exists.
   *
   * This method is not safe unless a literal is used as the parameter.
   */
  public static realPathSync(path: string): string {
    return fs.realpathSync(path);
  }

  /**
   * Joins the given paths. This is a wrapper around path.join. It is recommended to only use this when you are dealing
   * with part of a path that is not a complete path reference on its own.
   *
   * This method is not safe unless literals are used as parameters.  Use this instead of path.join(...) directly when
   * you cannot confine a user to a base directory. It is best to avoid using user input directly for constructing paths.
   * If you must use user input, it is recommended  to use `PathEx.safeJoinWithBaseDirConfinement(...)` to join paths.
   *
   * For more information see: https://owasp.org/www-community/attacks/Path_Traversal
   * @param paths
   */
  public static join(...paths: string[]): string {
    return path.normalize(path.join(...paths));
  }

  /**
   * Resolves the given paths. This is a wrapper around path.resolve. It is recommended to only use this when you are dealing
   * with part of a path that is not a complete path reference on its own.
   *
   * This method is not safe unless literals are used as parameters.  Use this instead of path.resolve(...) directly when you cannot confine a user to a base
   * directory.
   *
   * For more information see: https://owasp.org/www-community/attacks/Path_Traversal
   * @param paths
   */
  public static resolve(...paths: string[]): string {
    return path.resolve(...paths);
  }
}
