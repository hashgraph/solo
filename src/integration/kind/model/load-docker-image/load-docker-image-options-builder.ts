// SPDX-License-Identifier: Apache-2.0

import {LoadDockerImageOptions} from './load-docker-image-options.js';

export class LoadDockerImageOptionsBuilder {
  private constructor(
    private _name?: string,
    private _nodes?: string,
    private _imageName?: string,
  ) {}

  public static builder(): LoadDockerImageOptionsBuilder {
    return new LoadDockerImageOptionsBuilder();
  }

  /**
   * Set the name of the cluster (default "kind").
   * @param name
   */
  public name(name: string): LoadDockerImageOptionsBuilder {
    this._name = name;
    return this;
  }

  /**
   * Set the nodes to load images into.
   * @param nodes
   */
  public nodes(nodes: string): LoadDockerImageOptionsBuilder {
    this._nodes = nodes;
    return this;
  }

  /**
   * Set the image name to load.
   * @param imageName
   */
  public imageName(imageName: string): LoadDockerImageOptionsBuilder {
    this._imageName = imageName;
    return this;
  }

  /**
   * Build the LoadDockerImageOptions instance.
   */
  public build(): LoadDockerImageOptions {
    return new LoadDockerImageOptions(this._imageName, this._name, this._nodes);
  }

  public static from(options: LoadDockerImageOptions): LoadDockerImageOptionsBuilder {
    if (!options) {
      return new LoadDockerImageOptionsBuilder();
    }
    return new LoadDockerImageOptionsBuilder(options.name, options.nodes);
  }
}
