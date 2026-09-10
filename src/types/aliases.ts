// SPDX-License-Identifier: Apache-2.0

import {type Stats} from 'node:fs';
import {type ReadEntry} from 'tar';

export type NodeAlias = `node${number}`;
export type NodeId = number;

export type NodeAliases = NodeAlias[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandBuilder = (yargs: any) => any;

export type TarCreateFilter = (path: string, entry: Stats | ReadEntry) => boolean;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SkipCheck = (context_: any) => Promise<boolean> | boolean;

export type ConfigBuilder = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  argv: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context_: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  task: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configMaps?: any,
  shouldLoadNodeClient?: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

export type IP = string;

export type JsonString = string;

export type Path = string;
export type DirectoryPath = string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyObject = Record<any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyYargs = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyListrContext = any;

export type SdkNetworkEndpoint = `${string}:${number}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ArgvStruct = {_: string[]} & Record<string, any>;
