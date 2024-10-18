# Solo autogen tool

## Description

The Solo autogen tool is used to add e2e test cases that need to be ran independently as their own job into the GitHub workflows and into the solo package.json

## Usage

from solo root directory:

```bash
cd .github/workflows/autogen
npm install
npm run autogen
```

Use git to detect file changes and validate that they are correct.

The templates need to be maintained, you can either make changes directly to the templates and then run the tool, or make changes in both the workflow yaml files and the templates.  Should the templates fall out of sync, then you can update the templates so that when autogen runs again, the git diff will better match.

```bash
template.flow-build-application.yaml
template.flow-pull-request-checks.yaml
template.zxc-code-analysis.yaml
template.zxc-env-vars.yaml
```

For new e2e test jobs update the `<solo-root>/.github/workflows/templates/config.yaml`, adding a new item to the tests object with a name and mochaPostfix attribute.

NOTE: IntelliJ copy/paste will alter the escape sequences, you might have to manually type it in, clone a line, or use an external text editor.

e.g.:

```yaml
  - name: Mirror Node
    mochaPostfix: "--ignore '.*\\/unit\\/.*'"

```

## Development

To run lint fix:

```bash
cd .github/workflows/autogen
eslint --fix .
```
