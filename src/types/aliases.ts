// SPDX-License-Identifier: Apache-2.0

import {type Listr} from 'listr2';
import {type Stats} from 'node:fs';
import {type ReadEntry} from 'tar';
import {type SoloListrTaskWrapper} from './index.js';

export type NodeAlias = `node${number}`;
export type NodeId = number;

export type NodeAliases = NodeAlias[];

export type CommandBuilder = (yargs: any) => any;

export type TarCreateFilter = (path: string, entry: Stats | ReadEntry) => boolean;

export type SkipCheck = (ctx: any) => Promise<boolean> | boolean;

export type TaskFunction = (
  ctx: any,
  task: SoloListrTaskWrapper<any>,
) => Promise<Listr<any, any, any>> | Listr<any, any, any> | Promise<void> | void;

export type ConfigBuilder = (argv, ctx, task, configMaps?, shouldLoadNodeClient?) => Promise<any>;

export type IP = string;

export type JsonString = string;

export type Path = string;
export type DirPath = string;

export type AnyObject = Record<any, any>;
export type AnyYargs = any;
export type AnyListrContext = any;

export type SdkNetworkEndpoint = `${string}:${number}`;

export type ArgvStruct = {_: string[]} & Record<string, any>;
