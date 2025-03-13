/*
 * Copyright (C) 2022-2023 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Exception thrown when a version string cannot be parsed as a semantic version number.
 */
export class InvalidSemanticVersionException extends Error {
  /**
   * The cause of this exception.
   */
  public cause?: Error;

  /**
   * Constructs a new instance of an {@link InvalidSemanticVersionException}.
   *
   * @param message optional message to associate with this exception.
   * @param cause optional cause of this exception.
   */
  constructor(message?: string, cause?: Error) {
    super(message);
    if (cause) {
    this.cause = cause;
    }
    this.name = 'InvalidSemanticVersionException';
  }
} 