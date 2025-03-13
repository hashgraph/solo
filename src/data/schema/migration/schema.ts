// SPDX-License-Identifier: Apache-2.0

import {type ClassConstructor} from '../../../business/utils/class-constructor.type.js';
import {type SchemaMigration} from './schema-migration.js';
import {type Version} from '../../../business/utils/version.js';

/**
 * Defines a schema which can be used to convert input data into a model instance.
 */
export interface Schema<T> {
  /**
   * The name of the schema. Schema name are unique and should be related to the specific configuration model which
   * the schema represents.
   */
  readonly name: string;

  /**
   * The current version of the schema. This is used to determine if the input data needs to be migrated before being
   * applied to a model.
   */
  readonly version: number;

  /**
   * The class constructor for the model. This is used to create instances of the model from the input data.
   */
  readonly classCtor: ClassConstructor<T>;

  /**
   * The list of migrations which can be applied to the model data. Migrations are applied in order to bring the input data
   * up to the current schema version.
   */
  readonly migrations: SchemaMigration[];

  /**
   * Transforms the plain javascript object into an instance of the model class. Applies any necessary migrations to the
   * input data before creating the model instance.
   *
   * @param data - The plain javascript object to be transformed.
   * @param sourceVersion - The version of the input data. If not provided, the version is introspected from or
   *                        otherwise assumed based on the provided plain javascript object.
   * @returns an instance of the model class.
   */
  transform(data: object, sourceVersion?: Version<number>): T;
}
