// SPDX-License-Identifier: Apache-2.0

/**
 * One image entry of the Solo image cache manifest, with its CDN locations already resolved.
 *
 * The tar file name carries the registry, container and version of {@link image}, so it is unique per
 * image reference and can be stored flat on the CDN alongside every other version.
 */
export class CacheManifestImage {
  public constructor(
    /** Full image reference, for example `docker.io/library/busybox:1.36.1`. */
    public readonly image: string,
    /** Bare file name of the image archive on the CDN. */
    public readonly tarFile: string,
    /** Bare file name of the file holding the archive's SHA-256 hash. */
    public readonly hashFile: string,
    /** Lowercase hex SHA-256 of the archive, as recorded in the manifest. */
    public readonly sha256: string,
    /** Absolute CDN URL of {@link tarFile}. */
    public readonly tarUrl: string,
    /** Absolute CDN URL of {@link hashFile}. */
    public readonly hashUrl: string,
  ) {}
}
