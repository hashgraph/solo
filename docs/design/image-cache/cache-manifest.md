# Image Cache: Manifest Schema and CDN Layout

## 1. Context

Part of epic [#5738](https://github.com/hiero-ledger/solo/issues/5738) (Solo Image Cache
Enhancements). This is the design task [#5742](https://github.com/hiero-ledger/solo/issues/5742)
(A1). It records the contract between the two halves of the image cache:

- **Producers (CI):** the release pipeline creates the image archives and hashes
  ([#5745](https://github.com/hiero-ledger/solo/issues/5745), A3), uploads them to the CDN
  ([#5746](https://github.com/hiero-ledger/solo/issues/5746), A4), and publishes the manifest as a
  release asset ([#5747](https://github.com/hiero-ledger/solo/issues/5747), A5).
- **Consumer (CLI):** `solo cache image pull` downloads the manifest for the running Solo version,
  then the archives it lists, and verifies each one before caching it. Implemented by
  `CacheManifestClient`, `ImageCacheHandler` and `ImageCacheHousekeeper`
  ([#6054](https://github.com/hiero-ledger/solo/pull/6054), B2 to B6).

The schema below was agreed on #5742 and is what the CLI already enforces; the optional `size`
field was approved there afterwards and is added alongside this document.

## 2. Manifest

### 2.1 Location

One manifest per Solo release, published as a release asset named `cache-manifest.json`:

```text
https://github.com/hiero-ledger/solo/releases/download/v<soloVersion>/cache-manifest.json
```

`SOLO_CACHE_MANIFEST_URL` replaces this URL wholesale, for a manifest that is not published as a
release asset (staging, testing).

### 2.2 Example

```json
{
  "schemaVersion": 1,
  "soloVersion": "0.86.0",
  "images": [
    {
      "image": "docker.io/library/busybox:1.36.1",
      "tarFile": "docker.io__library__busybox__1.36.1.tar",
      "hashFile": "docker.io__library__busybox__1.36.1.tar.sha256",
      "sha256": "3f57d9401f8d42f986df300f0c69192fc41da28ae8c15f9f5c0a4b1f1d59f7cf",
      "size": 4116480
    }
  ]
}
```

### 2.3 Fields

| Field               | Type    | Required | Rule enforced by the CLI                                              |
| ------------------- | ------- | -------- | --------------------------------------------------------------------- |
| `schemaVersion`     | integer | yes      | Must be `1`; any other value rejects the manifest.                    |
| `soloVersion`       | string  | yes      | Must equal the requested Solo version, with or without a leading `v`. |
| `images`            | array   | yes      | Non-empty.                                                            |
| `images[].image`    | string  | yes      | Non-empty image reference (§3).                                       |
| `images[].tarFile`  | string  | yes      | Bare file name (§4): no `/`, `\` or `..`.                             |
| `images[].hashFile` | string  | yes      | Bare file name (§4): no `/`, `\` or `..`.                             |
| `images[].sha256`   | string  | yes      | SHA-256 of the archive, 64 lowercase hex characters.                  |
| `images[].size`     | integer | no       | Size of the archive in bytes; a non-negative integer when present.    |

A manifest that breaks any rule is rejected as a whole. Without a usable manifest the CLI caches
nothing, leaves the existing cache untouched, and the cluster pulls images from their registries.

## 3. Image References

`image` is the key the CLI looks images up by. It must equal, character for character, the
reference the CLI builds from its image list (`resources/config/solo-cache-images-target.yaml`):

- Tagged images: `<name>:<tag>`, for example `docker.io/library/busybox:1.36.1`.
- Digest-pinned images: `<name>@sha256:<digest>`, for example
  `docker.io/pgsty/silo@sha256:635197cb…`.

Names are fully qualified: the registry is always present, Docker Hub is `docker.io` (not
`index.docker.io` or `registry-1.docker.io`), and Docker Hub official images carry the `library/`
prefix. A producer that reads references from somewhere else, such as the pods of a deployed
cluster, must normalize them to this form. An image the manifest does not list is skipped by the
CLI and left for the cluster to pull.

References must be immutable: an exact version tag or a digest, never a moving tag such as
`latest`. The same file name must always describe the same bytes (§5).

## 4. File Names

The archive file name is the image reference with every `/` and `:` replaced by `__`, plus `.tar`.
The hash file name is the archive file name plus `.sha256`.

| Image                                          | `tarFile`                                             |
| ---------------------------------------------- | ----------------------------------------------------- |
| `docker.io/library/busybox:1.36.1`             | `docker.io__library__busybox__1.36.1.tar`             |
| `ghcr.io/hiero-ledger/hiero-block-node:0.43.0` | `ghcr.io__hiero-ledger__hiero-block-node__0.43.0.tar` |
| `docker.io/pgsty/silo@sha256:<digest>`         | `docker.io__pgsty__silo@sha256__<digest>.tar`         |

This is the same rule the CLI uses to name archives in the local cache, so a CDN file and its local
copy have the same name. Embedding the registry, path and version makes every name unique across
Solo releases.

`hashFile` is carried explicitly in the manifest instead of being derived from `tarFile`, so the
extension convention can change without a CLI release.

## 5. CDN Layout

The CDN is flat, with no version or registry directories:

```text
https://cdn.solo.hashgraph.io/<tarFile>
https://cdn.solo.hashgraph.io/<hashFile>
```

`SOLO_CACHE_CDN_BASE_URL` overrides the base URL for staging and testing.

Because names are unique per image and version, an image that does not change between two releases
is the same object and is uploaded once. A published object is never replaced: the upload step
skips a file that already exists with the same hash and fails the release when it exists with a
different one. Producers must therefore create archives that are byte-for-byte reproducible, so the
same image always produces the same hash.

## 6. Hashes

The hash algorithm is SHA-256, and the value is published twice: in the manifest (`sha256`) and as
the contents of `hashFile`. Producers write the bare digest; the CLI also accepts the `sha256sum`
output format (`<digest>  <filename>`) and reads the first token.

On download the CLI:

1. Fetches `hashFile` and requires it to match the manifest `sha256`; otherwise the archive is not
   downloaded.
2. Fetches `tarFile`, requires its size to match `size` when the manifest records one, then
   requires its computed SHA-256 to match.

Any mismatch deletes the archive and its hash file, so the next `solo cache image pull` downloads
it again. A cached archive is hashed again before it is loaded into a cluster; a mismatch stops the
load with an error instead of loading the archive.

## 7. Versioning

`schemaVersion` is `1`. Adding an optional field that an older CLI can ignore, such as `size`,
keeps the version. A change an older CLI would misread (a renamed, retyped or newly required field)
increments it; an older CLI then rejects the manifest and falls back to registry pulls instead of
misparsing it.

## 8. Out of Scope

- The contents of the archive (image layout format and platforms it holds): decided by A3
  ([#5745](https://github.com/hiero-ledger/solo/issues/5745)).
- How CI uploads to the CDN and publishes the manifest: A4 and A5.
