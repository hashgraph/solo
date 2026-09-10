# Solo Release Checklist

## 1. Verify Workflows

- Check that the last merge to `main` passed all workflows:
  - https://github.com/hiero-ledger/solo/actions?query=branch%3Amain

## 2. Validate Documentation Site

- Review deployed docs:
  - https://solo.hiero.org/main/docs/advanced-deployments/
- Check other key pages for correctness
- Note: Site updates automatically on PR merge to `main`

## 3. Compare Changes Since Last Release

- Compare latest tag with `main`:
  - Example:
    - https://github.com/hiero-ledger/solo/compare/v0.63.0...main

## 4. Determine Next Version

- Review commit messages
- Follow commit message conventions from PR template
- Alternatively:
  - Run release workflow with `dry-run` to determine version

## 5. Review Migration Impact

- Inspect changes in `/data` folder:
  - Local config migrations
  - Remote config migrations
- Confirm migration scenarios are covered
- Assess impact on:
  - Helm chart upgrades
- Decide version bump:
  - Patch / Minor / Major

## 6. Update Documentation (Skip if PATCH)

- Create PR updating:
  - `README.md`
  - `docs/legacy-versions.md`
- Include:
  - New Solo version
  - Helm chart version
  - CN / Hedera versions
  - Release date
  - End of support:
    - Odd versions → 1 month
    - Even versions → 3 months
- Get approval and merge PR

## 7. Run Release Workflow

- Workflow:
  - https://github.com/hiero-ledger/solo/actions/workflows/flow-deploy-release-artifact.yaml
- Settings:
  - **Use workflow from:** `main`
  - **Dual publish:** `true`
  - **Dry run:** `false`

## 8. Update npm `latest` Tags (Manual, if needed)

> ⚠️ Requires npm access

- npm dist-tag add @hiero-ledger/solo@<version> latest
- During the dual-publish window, also run:
  - npm dist-tag add @hashgraph/solo@<version> latest

## 9. Verify npm Package (@hiero-ledger)

- https://www.npmjs.com/package/@hiero-ledger/solo?activeTab=versions

## 10. Verify JFrog Artifactory (@hiero-ledger)

- https://artifacts.hashgraph.io/ui/packages/npm:%2F%2F@hiero-ledger%2Fsolo/

## 11. Verify npm Package (@hashgraph)

- https://www.npmjs.com/package/@hashgraph/solo?activeTab=versions

## 12. Verify JFrog Artifactory (@hashgraph)

- https://artifacts.hashgraph.io/ui/packages/npm:%2F%2F@hashgraph%2Fsolo/
