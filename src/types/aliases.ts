// SPDX-License-Identifier: Apache-2.0

import {type Listr, type ListrTaskWrapper} from 'listr2';
import {type Stats} from 'node:fs';
import {type ReadEntry} from 'tar';

export type NodeAlias = `node${number}`;
export type NodeId = number;

export type NodeAliases = NodeAlias[];

export type CommandBuilder = (yargs: any) => any;

export type TarCreateFilter = (path: string, entry: Stats | ReadEntry) => boolean;

export type SkipCheck = (context_: any) => Promise<boolean> | boolean;

export type TaskFunction = (
  context_: any,
  task: ListrTaskWrapper<any, any, any>,
) => Promise<Listr<any, any, any>> | Listr<any, any, any> | Promise<void> | void;

export type ConfigBuilder = (argv, context_, task, configMaps?, shouldLoadNodeClient?) => Promise<any>;

export type IP = string;

export type JsonString = string;

export type Path = string;
export type DirectoryPath = string;

export type AnyObject = Record<any, any>;
export type AnyYargs = any;
export type AnyListrContext = any;

export type SdkNetworkEndpoint = `${string}:${number}`;

export type ArgvStruct = {_: string[]} & Record<string, any>;
