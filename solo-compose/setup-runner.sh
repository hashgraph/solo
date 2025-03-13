#! /usr/bin/env bash

BRANCH_NAME="main"

# Clone repository
echo "***** Setting up Solo Repository *****"

git clone https://github.com/hashgraph/solo.git solo
cd ./solo || exit
git checkout "${BRANCH_NAME}"

# Dependencies Versions
NODE_VERSION="20.17.0"
KIND_VERSION="v0.22.0"
HELM_VERSION="3.15.4"

echo "***** Setup *****"

# Setup Corepack
sudo ln -s /home/runner/_work/_tool/node/${NODE_VERSION}/x64/bin/corepack /usr/bin/corepack
echo "Corepack setup completed."

# Setup NPM
sudo ln -s /home/runner/_work/_tool/node/${NODE_VERSION}/x64/bin/npm /usr/bin/npm
echo "NPM setup completed."

# Setup NPX
sudo ln -s /home/runner/_work/_tool/node/${NODE_VERSION}/x64/bin/npx /usr/bin/npx
echo "NPX setup completed."

# Setup Node.js
sudo ln -s /home/runner/_work/_tool/node/${NODE_VERSION}/x64/bin/node /usr/bin/node
echo "Node.js setup completed."

# Setup Kind
sudo ln -s /home/runner/_work/_tool/kind/${KIND_VERSION}/amd64/kind /usr/bin/kind
echo "Kind setup completed."

# Setup Kubectl
sudo ln -s /home/runner/_work/_tool/kind/${KIND_VERSION}/amd64/kubectl /usr/bin/kubectl
echo "Kubectl setup completed."

# Setup Helm
sudo ln -s /home/runner/_work/_tool/helm/${HELM_VERSION}/x64/linux-amd64/helm /usr/bin/helm
echo "Helm setup completed."

# Install Dependencies
echo "Installing dependencies..."
npm ci
echo "Dependencies installed successfully."

#####################################################

# Example
task test

#####################################################

# Prevent Service from exiting
/usr/bin/env sleep infinity