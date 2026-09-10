#!/bin/bash

# proto.zip vendors the block-node API/stream protos (block/, block_access_service.proto)
# plus the matching hiero-consensus-node HAPI protos (services/, streams/, platform/, sdk/,
# mirror/) that they transitively import. These MUST stay pinned to the actual
# BLOCK_NODE_VERSION (see version.ts) — grpcurl decodes the live response against this schema,
# and a stale block/stream/*.proto silently mis-decodes wire-compatible-but-reshaped fields
# instead of failing to compile (see issue #5848). To regenerate for a new BLOCK_NODE_VERSION:
#   1. Check out the matching tag in hiero-block-node, e.g. `git checkout v0.39.0`.
#   2. Copy protobuf-sources/block-node-protobuf/block/ and
#      protobuf-sources/src/main/proto/block-node/api/block_access_service.proto verbatim.
#   3. Copy services/, streams/, platform/, sdk/, mirror/ from that same tag's bundled
#      protobuf-sources/hiero-consensus-node/hapi/hedera-protobuf-java-api/src/main/proto/
#      (BN's own vendored HAPI snapshot) so the whole graph is internally consistent.
#   4. Leave google/ as-is (standard protobuf well-known types, not Hedera-specific).
#   5. Re-tar: `tar -czf proto.zip -C <assembled-root> .`
PROTO_DIR=$(dirname "$(realpath $0)")/proto

# Use --warning=no-unknown-keyword (GNU tar) on Linux and Windows (Git Bash/MINGW/MSYS).
# macOS ships BSD tar which does not support --warning, so skip it there.
case "$(uname -s)" in
  Darwin*)
    tar -xzf proto.zip -C proto
    ;;
  *)
    tar --warning=no-unknown-keyword -xzf proto.zip -C proto
    ;;
esac
RC=$?
if [[ $RC -ne 0 ]]; then
  echo "Failed to extract proto files: ${RC}"
  exit 1
fi

# block-access, getBlock --> should work as is.
grpcurl -plaintext \
  -import-path "$PROTO_DIR" \
  -proto "$PROTO_DIR/block_access_service.proto" \
  -d '{"retrieveLatest": true}' \
  localhost:40840 \
  org.hiero.block.api.BlockAccessService/getBlock
RC=$?

if [[ $RC -ne 0 ]]; then
  echo "Job failed block-access: ${RC}"
  exit 1
fi
