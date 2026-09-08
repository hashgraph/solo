# Solo

[![NPM Version](https://img.shields.io/npm/v/@hiero-ledger/solo?logo=npm)](https://www.npmjs.com/package/@hiero-ledger/solo)
[![GitHub License](https://img.shields.io/github/license/hiero-ledger/solo?logo=apache\&logoColor=red)](LICENSE)
![node-lts](https://img.shields.io/node/v-lts/@hiero-ledger/solo)
[![Build Application](https://github.com/hiero-ledger/solo/actions/workflows/flow-build-application.yaml/badge.svg)](https://github.com/hiero-ledger/solo/actions/workflows/flow-build-application.yaml)
[![Codacy Grade](https://app.codacy.com/project/badge/Grade/78539e1c1b4b4d4d97277e7eeeab9d09)](https://app.codacy.com/gh/hiero-ledger/solo/dashboard?utm_source=gh\&utm_medium=referral\&utm_content=\&utm_campaign=Badge_grade)
[![Codacy Coverage](https://app.codacy.com/project/badge/Coverage/78539e1c1b4b4d4d97277e7eeeab9d09)](https://app.codacy.com/gh/hiero-ledger/solo/dashboard?utm_source=gh\&utm_medium=referral\&utm_content=\&utm_campaign=Badge_coverage)
[![codecov](https://codecov.io/gh/hashgraph/solo/graph/badge.svg?token=hBkQdB1XO5)](https://codecov.io/gh/hashgraph/solo)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/hiero-ledger/solo/badge)](https://scorecard.dev/viewer/?uri=github.com/hiero-ledger/solo)
[![CII Best Practices](https://bestpractices.coreinfrastructure.org/projects/10697/badge)](https://bestpractices.coreinfrastructure.org/projects/10697)

An opinionated CLI tool to deploy and manage standalone test networks.

## Homebrew Deprecation Notice

**Warning: Homebrew support for Solo is being removed.** The Solo Homebrew formula will stop being updated after **August 31, 2026**; releases published after that date will only be available from npm.

Install and upgrade Solo with npm instead:

```bash
npm install -g @hiero-ledger/solo
```

If Solo is currently installed with Homebrew, switch over with:

```bash
brew uninstall solo
npm install -g @hiero-ledger/solo
```

## Releases

Solo releases are supported for one month after their release date. LTS (Long-Term Support) versions are supported for three months. Upgrade to the latest version to benefit from new features and improvements. 

### Current Releases

| Solo Version | Node.js             | Consensus Node | Kubernetes | Docker Resources               | Release Date | End of Support |
|--------------|---------------------|----------------|------------|--------------------------------|--------------|----------------|
| 0.88.0       | >= 22.0.0 (lts/jod) | v0.75.1        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-08-25   | 2026-09-25     |
| 0.87.0       | >= 22.0.0 (lts/jod) | v0.75.1        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-08-18   | 2026-09-18     |
| 0.86.0       | >= 22.0.0 (lts/jod) | v0.74.0        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-08-12   | 2026-09-12     |
| 0.85.0       | >= 22.0.0 (lts/jod) | v0.74.0        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-08-04   | 2026-09-04     |
| 0.84.0 (LTS) | >= 22.0.0 (lts/jod) | v0.74.0        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-07-28   | 2026-10-28     |
| 0.82.0 (LTS) | >= 22.0.0 (lts/jod) | v0.74.0        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-07-14   | 2026-10-14     |
| 0.80.0 (LTS) | >= 22.0.0 (lts/jod) | v0.74.0        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-06-30   | 2026-09-30     |
| 0.78.0 (LTS) | >= 22.0.0 (lts/jod) | v0.74.0        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-06-16   | 2026-09-16     |
| 0.76.0 (LTS) | >= 22.0.0 (lts/jod) | v0.73.0        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-06-02   | 2026-09-02     |
| 0.74.0 (LTS) | >= 22.0.0 (lts/jod) | v0.73.0        | >= v1.32.2 | Memory >= 12GB, CPU cores >= 6 | 2026-05-26   | 2026-08-26     |

To see a list of legacy releases, please check the [legacy versions documentation page](legacy-versions.md).

## Documentation

Our documentation is available here: [solo.hiero.org](https://solo.hiero.org/)

## Contributing

Contributions are welcome. Please see the [contributing guide](https://github.com/hiero-ledger/.github/blob/main/CONTRIBUTING.md) to see how you can get involved.

## Code of Conduct

This project is governed by the [Contributor Covenant Code of Conduct](https://github.com/hiero-ledger/.github/blob/main/CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code of conduct.

## License

[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
