// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs/promises';
import {parse, stringify} from 'yaml';
import {PathEx} from '../../../business/utils/path-ex.js';
import {CacheImageTemplateUnknownError} from '../errors/cache-image-template-unknown-error.js';
import {CacheImageTemplateUndeclaredError} from '../errors/cache-image-template-undeclared-error.js';
import {type CacheImageTemplateResolver} from '../api/cache-image-template-resolver.js';

interface ImageTargetTemplateEntry {
  name: string;
  source?: string;
  version: string;
}

interface ImageTargetsTemplateFile {
  templates?: string[];
  images?: ImageTargetTemplateEntry[];
}

export class CacheImageTargetTemplateRenderer {
  public static readonly RENDERED_FILE_NAME: string = 'solo-cache-images-target.rendered.yaml';

  public constructor(private readonly templateResolver: CacheImageTemplateResolver) {}

  public async renderToFile(sourceFilePath: string, outputDirectory: string): Promise<string> {
    const raw: string = await fs.readFile(sourceFilePath, 'utf8');
    const parsed: ImageTargetsTemplateFile = parse(raw) as ImageTargetsTemplateFile;

    const templates: string[] = parsed.templates ?? [];
    this.validateTemplates(templates);

    const rendered: ImageTargetsTemplateFile = {
      images: (parsed.images ?? []).map((image: ImageTargetTemplateEntry): ImageTargetTemplateEntry => ({
        ...image,
        version: this.resolveVersion(image.version, templates),
      })),
    };

    await fs.mkdir(outputDirectory, {recursive: true});

    const renderedFilePath: string = PathEx.join(outputDirectory, CacheImageTargetTemplateRenderer.RENDERED_FILE_NAME);
    await fs.writeFile(renderedFilePath, stringify(rendered), 'utf8');

    return renderedFilePath;
  }

  private validateTemplates(templates: readonly string[]): void {
    for (const template of templates) {
      if (!this.templateResolver.has(template)) {
        throw new CacheImageTemplateUnknownError(template);
      }
    }
  }

  private resolveVersion(rawVersion: string, templates: readonly string[]): string {
    if (templates.includes(rawVersion)) {
      return this.templateResolver.resolve(rawVersion);
    }

    const looksLikeTemplateKey: boolean = /^[A-Z0-9_]+$/.test(rawVersion);
    if (looksLikeTemplateKey) {
      throw new CacheImageTemplateUndeclaredError(rawVersion);
    }

    return rawVersion;
  }
}
