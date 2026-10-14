# How to Contribute to Solo

This document describes how to set up a local development environment and contribute to the Solo project.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial setup](#initial-setup)
- [Logs and debugging](#logs-and-debugging)
- [How to run the tests](#how-to-run-the-tests)
- [Code formatting](#code-formatting)
- [How to Update Component Versions](#how-to-update-component-versions)
- [How to Inspect the Cluster](#how-to-inspect-the-cluster)
  - [Kubectl](#kubectl)
  - [K9s (Recommended)](#k9s-recommended)
- [Pull Request Requirements](#pull-request-requirements)
  - [DCO (Developer Certificate of Origin) and Signed Commits](#dco-developer-certificate-of-origin-and-signed-commits)
  - [Conventional Commit PR titles (required)](#conventional-commit-pr-titles-required)
  - [Additional guidelines](#additional-guidelines)

---

## Prerequisites

- **Node.js** (use the version specified in the repository, if applicable)
- **npm**
- **Docker or Podman**
- **Kubernetes** (local cluster such as kind, k3d, or equivalent)
- **task** (Taskfile runner)
- **Git**
- **K9s** (optional)

## Initial setup

1. Clone the repository:

   ```bash
   git clone https://github.com/hiero-ledger/solo.git
   cd solo
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Install solo as a local CLI:

   ```bash
   npm link
   ```

   > *Notes*:
   >
   > - This only needs to be done once.
   > - If solo already exists in your **PATH**, remove it first.
   > - Alternatively, you can run commands via: `npm run solo-test -- <COMMAND> <ARGS>`

4. Run the CLI:

   ```bash
   solo
   ```

## Logs and debugging

- Solo logs are written to:

  ```bash
  $HOME/.solo/logs/solo.log
  ```

- A common debugging pattern is:

  ```bash
  tail -f $HOME/.solo/logs/solo.log | jq
  ```

## How to run the tests

- Create a context if not already present:

  ```bash
  $ kind create cluster -n solo-e2e
  Creating cluster "solo-e2e" ...
  ✓ Ensuring node image (kindest/node:v1.37.0) 🖼️
  ✓ Preparing nodes 📦
  ✓ Writing configuration 📜
  ✓ Starting control-plane 🕹️
  ✓ Installing CNI 🔌
  ✓ Installing StorageClass 💾
  Set kubectl context to "kind-solo-e2e"
  You can now use your cluster with:

  kubectl cluster-info --context kind-solo-e2e

  Have a question, bug, or feature request? Let us know! https://kind.sigs.k8s.io/#community 🙂
  ```

- Unit tests:

  ```bash
  task test
  ```

- All other Integration and E2E test tasks can be listed using

  ```bash
  task --list-all
  ```

## Code formatting

Before committing any changes, always run:

```bash
task format
```

## How to Update Component Versions

- Edit the component's version inside `/version.ts`

## How to Inspect the Cluster

When debugging, it helps to inspect resources and logs in the Kubernetes cluster.

### *Kubectl*

Common kubectl commands:

- `kubectl get pods -A`
- `kubectl get svc -A`
- `kubectl get ingress -A`
- `kubectl describe pod <pod-name> -n <namespace>`
- `kubectl logs <pod-name> -n <namespace>`

*Official Documentation*: <https://kubernetes.io/docs/reference/kubectl/>

### **K9s** *(Recommended)*

> **K9s** is the primary tool used by the Solo team to inspect and debug Solo deployments.

Why **K9s**:

- Terminal UI that makes it faster to navigate Kubernetes resources
- Quickly view logs, events, and descriptions
- Simple and intuitive

Start **K9s**:

```bash
k9s -A
```

*Official Documentation*: <https://k9scli.io/topics/commands/>

## Pull Request Requirements

### DCO (Developer Certificate of Origin) and Signed Commits

Two separate requirements are enforced on this repository:

#### 1) DCO Sign-off (required)

Refer to the Hiero Ledger contributing docs under sign-off: <https://github.com/hiero-ledger/.github/blob/main/CONTRIBUTING.md#sign-off>

*(Optional)* Configure Git to **always** add the sign-off **automatically**:

```bash
git config --global format.signoff true
```

#### 2) Cryptographically Signed Commits (required)

In addition to the DCO sign-off, the repository also enforces a GitHub rule that blocks commits that are not **signed and verified**.

This means your commits must be cryptographically signed using GPG or SSH and show a **Verified** badge on GitHub.

If your commits are not signed, they will be rejected even if the DCO check passes.

To enable commit signing, see GitHub documentation:

- [GPG signing](https://docs.github.com/en/authentication/managing-commit-signature-verification/adding-a-gpg-key-to-your-github-account)
- [SSH signing](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account)

After setup, verify signing is enabled:

```bash
git config --global commit.gpgsign true
```

Both are required:

- DCO sign-off line (`-s`)
- Cryptographic signature (*Verified commit*)

### Conventional Commit PR titles *(required)*

Pull request titles must follow Conventional Commits.

> *Examples*:
>
> - `feat: add support for grpc-web fqdn endpoints`
> - `fix: correct version resolution for platform components`
> - `docs: update contributing guide`
> - `chore: bump dependency versions`

This is required for consistent release notes and changelog generation.

### Additional guidelines

- Prefer small, focused PRs that are easy to review.
- If you are unsure where to start, open a draft PR early to get feedback.
- Add description and link all related issues to the PR.
