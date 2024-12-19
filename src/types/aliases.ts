/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import type {Listr, ListrTaskWrapper} from 'listr2';
import {type Stats} from 'node:fs';
import {type ReadEntry} from 'tar';

export type NodeAlias = `node${number}`;
export type PodName = `network-${NodeAlias}-0`;
export type NodeId = number;

export type NodeAliases = NodeAlias[];

export type CommandBuilder = (yargs: any) => any;

export type UserPrompt = (task: ListrTaskWrapper<any, any, any>, input: any | string[]) => Promise<any>;

export type TarCreateFilter = (path: string, entry: Stats | ReadEntry) => boolean;

export type SkipCheck = (ctx: any) => Promise<boolean> | boolean;

export type TaskFunction = (
  ctx: any,
  task: ListrTaskWrapper<any, any, any>,
) => Promise<Listr<any, any, any>> | Listr<any, any, any> | Promise<void> | void;

export type ConfigBuilder = (argv, ctx, task) => Promise<any>;

export type Nullable<T> = T | null;

export type IP = string;

export type JsonString = string;

export type Path = string;
export type FilePath = string;
export type DirPath = string;

export type AnyObject = Record<any, any>;
