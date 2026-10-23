# test/data/proto

Protobuf schemas used by [`../get-block.sh`](../get-block.sh) to call the block node
`BlockAccessService/getBlock` endpoint with `grpcurl`.

`get-block.sh` extracts [`../proto.zip`](../proto.zip) into this directory. Only the two files
below are committed; everything else from the zip is git-ignored.

## Sources

`proto.zip` was last generated for block node `v0.44.2`.

| Path                                                    | Source                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `block_access_service.proto`                            | [hiero-block-node `v0.44.2`: `protobuf-sources/src/main/proto/block-node/api/block_access_service.proto`](https://github.com/hiero-ledger/hiero-block-node/blob/v0.44.2/protobuf-sources/src/main/proto/block-node/api/block_access_service.proto)                                                                                                                                                                                                    |
| `block/`                                                | [hiero-consensus-node `v0.76.1`: `hapi/hedera-protobuf-java-api/src/main/proto/block`](https://github.com/hiero-ledger/hiero-consensus-node/tree/v0.76.1/hapi/hedera-protobuf-java-api/src/main/proto/block), with `block/stream/record_file_item.proto` replaced by the [block node override](https://github.com/hiero-ledger/hiero-block-node/blob/v0.44.2/protobuf-sources/src/main/proto-overrides/block/stream/record_file_item.proto) |
| `services/`, `streams/`, `platform/`, `sdk/`, `mirror/` | [hiero-consensus-node `v0.76.1`: `hapi/hedera-protobuf-java-api/src/main/proto`](https://github.com/hiero-ledger/hiero-consensus-node/tree/v0.76.1/hapi/hedera-protobuf-java-api/src/main/proto)                                                                                                                                                                                                                                            |
| `google/protobuf/wrappers.proto`                        | [protocolbuffers/protobuf `v31.1`: `src/google/protobuf/wrappers.proto`](https://github.com/protocolbuffers/protobuf/blob/v31.1/src/google/protobuf/wrappers.proto)                                                                                                                                                                                                                                                                                   |

The consensus node version is the `cnVersion` that the block node release pins in
[`protobuf-sources/build.gradle.kts`](https://github.com/hiero-ledger/hiero-block-node/blob/v0.44.2/protobuf-sources/build.gradle.kts).

## Regenerating

When `BLOCK_NODE_VERSION` in [`version.ts`](../../../version.ts) changes, rebuild `proto.zip` from the
matching block node tag (steps in the header of [`get-block.sh`](../get-block.sh)) and update the
versions in this file.
