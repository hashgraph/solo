// SPDX-License-Identifier: Apache-2.0

import {GitHubApiClient} from '../../../core/github-api-client.js';
import {SoloErrors} from '../../../core/errors/solo-errors.js';
import * as constants from '../../../core/constants.js';
import {CacheManifestImage} from '../models/impl/cache-manifest-image.js';
import {getSoloVersion} from '../../../../version.js';

/** Raw shape of one `images` entry in `cache-manifest.json`. Every field is validated before use. */
interface RawCacheManifestImage {
  image?: unknown;
  tarFile?: unknown;
  hashFile?: unknown;
  sha256?: unknown;
}

/** Raw shape of `cache-manifest.json`. Every field is validated before use. */
interface RawCacheManifest {
  schemaVersion?: unknown;
  soloVersion?: unknown;
  images?: unknown;
}

/**
 * Downloads and validates the image cache manifest published as a release asset for a given Solo version,
 * and resolves each entry to its CDN locations.
 *
 * The manifest lists, for the Solo version that produced it, every container image the deployment needs,
 * the archive file name for that image, the file name holding the archive's SHA-256, and the hash value
 * itself. Both hash representations are kept so a download can be checked against the manifest and against
 * the published hash file, and the two must agree.
 *
 * The CDN is flat: `<base>/<tarFile>` and `<base>/<hashFile>`. The base defaults to
 * `https://cdn.solo.hashgraph.io` and can be overridden with the `SOLO_CACHE_CDN_BASE_URL` environment
 * variable for staging and testing.
 */
export class CacheManifestClient {
  public static readonly DEFAULT_CDN_BASE_URL: string = 'https://cdn.solo.hashgraph.io';
  public static readonly CDN_BASE_URL_ENVIRONMENT_VARIABLE: string = 'SOLO_CACHE_CDN_BASE_URL';
  public static readonly SCHEMA_VERSION: number = 1;

  private static readonly MANIFEST_FILE_NAME: string = 'cache-manifest.json';
  private static readonly RELEASE_DOWNLOAD_BASE_URL: string = 'https://github.com/hiero-ledger/solo/releases/download';
  private static readonly SHA256_PATTERN: RegExp = /^[\da-f]{64}$/;

  private constructor() {}

  /** Resolves the CDN base URL, without a trailing slash. */
  public static getCdnBaseUrl(): string {
    const configured: string | undefined = constants.getEnvironmentVariable(
      CacheManifestClient.CDN_BASE_URL_ENVIRONMENT_VARIABLE,
    );

    const baseUrl: string =
      configured && configured.trim().length > 0 ? configured.trim() : CacheManifestClient.DEFAULT_CDN_BASE_URL;

    return baseUrl.replace(/\/+$/, '');
  }

  /** Resolves the release asset URL of the manifest for the given Solo version. */
  public static getManifestUrl(soloVersion: string = getSoloVersion()): string {
    const tag: string = soloVersion.startsWith('v') ? soloVersion : `v${soloVersion}`;

    return `${CacheManifestClient.RELEASE_DOWNLOAD_BASE_URL}/${tag}/${CacheManifestClient.MANIFEST_FILE_NAME}`;
  }

  /**
   * Downloads the manifest for the given Solo version and returns its images with CDN URLs resolved.
   *
   * @param soloVersion the Solo version whose manifest to fetch; defaults to the running version
   * @throws CacheManifestDownloadFailedSoloError when the manifest cannot be fetched or read
   * @throws CacheManifestInvalidSoloError when the manifest does not match the expected schema
   */
  public static async fetchImages(soloVersion: string = getSoloVersion()): Promise<readonly CacheManifestImage[]> {
    const url: string = CacheManifestClient.getManifestUrl(soloVersion);

    let body: string;
    try {
      const response: Response = await GitHubApiClient.get(url);
      body = await response.text();
    } catch (error) {
      throw new SoloErrors.system.cacheManifestDownloadFailed(url, error);
    }

    return CacheManifestClient.parse(url, soloVersion, body);
  }

  private static parse(url: string, soloVersion: string, body: string): readonly CacheManifestImage[] {
    let manifest: RawCacheManifest;
    try {
      manifest = JSON.parse(body) as RawCacheManifest;
    } catch (error) {
      throw new SoloErrors.system.cacheManifestInvalid(
        url,
        `not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new SoloErrors.system.cacheManifestInvalid(url, 'expected a JSON object at the top level');
    }

    if (manifest.schemaVersion !== CacheManifestClient.SCHEMA_VERSION) {
      throw new SoloErrors.system.cacheManifestInvalid(
        url,
        `unsupported schemaVersion ${JSON.stringify(manifest.schemaVersion)}, expected ${CacheManifestClient.SCHEMA_VERSION}`,
      );
    }

    if (typeof manifest.soloVersion !== 'string' || manifest.soloVersion.length === 0) {
      throw new SoloErrors.system.cacheManifestInvalid(url, 'soloVersion must be a non-empty string');
    }

    // The manifest is fetched by version, so a mismatch means the wrong asset was published under this tag.
    if (
      CacheManifestClient.stripVersionPrefix(manifest.soloVersion) !==
      CacheManifestClient.stripVersionPrefix(soloVersion)
    ) {
      throw new SoloErrors.system.cacheManifestInvalid(
        url,
        `soloVersion '${manifest.soloVersion}' does not match the requested version '${soloVersion}'`,
      );
    }

    if (!Array.isArray(manifest.images) || manifest.images.length === 0) {
      throw new SoloErrors.system.cacheManifestInvalid(url, 'images must be a non-empty array');
    }

    const baseUrl: string = CacheManifestClient.getCdnBaseUrl();

    return manifest.images.map((entry: unknown, index: number): CacheManifestImage => {
      const raw: RawCacheManifestImage = CacheManifestClient.requireObject(url, entry, index);

      const image: string = CacheManifestClient.requireString(url, raw.image, index, 'image');
      const tarFile: string = CacheManifestClient.requireFileName(url, raw.tarFile, index, 'tarFile');
      const hashFile: string = CacheManifestClient.requireFileName(url, raw.hashFile, index, 'hashFile');
      const sha256: string = CacheManifestClient.requireString(url, raw.sha256, index, 'sha256');

      if (!CacheManifestClient.SHA256_PATTERN.test(sha256)) {
        throw new SoloErrors.system.cacheManifestInvalid(
          url,
          `images[${index}].sha256 must be a 64 character lowercase hex SHA-256`,
        );
      }

      return new CacheManifestImage(
        image,
        tarFile,
        hashFile,
        sha256,
        `${baseUrl}/${tarFile}`,
        `${baseUrl}/${hashFile}`,
      );
    });
  }

  private static stripVersionPrefix(version: string): string {
    return version.startsWith('v') ? version.slice(1) : version;
  }

  private static requireObject(url: string, entry: unknown, index: number): RawCacheManifestImage {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new SoloErrors.system.cacheManifestInvalid(url, `images[${index}] must be an object`);
    }

    return entry as RawCacheManifestImage;
  }

  private static requireString(url: string, value: unknown, index: number, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new SoloErrors.system.cacheManifestInvalid(url, `images[${index}].${field} must be a non-empty string`);
    }

    return value.trim();
  }

  /**
   * Requires a bare file name. The CDN layout is flat and these names are appended to a URL and, later, used
   * to name local files, so a separator or a parent reference in a remotely published manifest is rejected
   * rather than resolved.
   */
  private static requireFileName(url: string, value: unknown, index: number, field: string): string {
    const fileName: string = CacheManifestClient.requireString(url, value, index, field);

    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      throw new SoloErrors.system.cacheManifestInvalid(
        url,
        `images[${index}].${field} must be a bare file name without path separators`,
      );
    }

    return fileName;
  }
}
