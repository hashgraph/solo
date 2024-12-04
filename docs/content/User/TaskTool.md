## Use the Task tool to launch Solo

First, install the cluster tool `kind` with this [link](https://kind.sigs.k8s.io/docs/user/quick-start#installation)

Then, install the task tool `task` with this [link](https://taskfile.dev/#/installation)

Then, use the following steps to install dependencies and build solo project.

```bash
npm ci
npm run build
```
Then, user can use one of the following three commands to quickly deploy a standalone solo network.

```bash
# Option 1) deploy solo network with two nodes
task default

# Option 2) deploy solo network with two nodes, and mirror node
task default-with-mirror

# Option 3) deploy solo network with two nodes, mirror node, and JSON RPC relay
task default-with-relay
```
To tear down the solo network
```bash
task clean
```
