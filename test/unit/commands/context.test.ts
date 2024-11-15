/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import sinon from 'sinon'
import { describe, it, beforeEach } from 'mocha'
import { expect } from 'chai'

import { ContextCommandTasks } from '../../../src/commands/context/tasks.ts'
import {
    AccountManager, CertificateManager,
    ChartManager,
    ConfigManager,
    DependencyManager,
    Helm, K8, KeyManager, LeaseManager,
    LocalConfig,
    PackageDownloader, PlatformInstaller, ProfileManager
} from "../../../src/core/index.ts";
import {getTestCacheDir, testLocalConfigData} from "../../test_util.ts";
import {BaseCommand} from "../../../src/commands/base.ts";
import {flags} from "../../../src/commands/index.ts";
import {SoloLogger} from "../../../src/core/logging.ts";
import Sinon from "sinon";
import {Opts} from "../../../src/types/index.ts";
import fs from "fs";
import {stringify} from "yaml";
import {KubeConfig} from "@kubernetes/client-node";

describe.only('ContextCommandTasks unit tests', () => {
    const filePath = `${getTestCacheDir('ContextCommandTasks')}/localConfig.yaml`

    const getBaseCommandOpts = () => {
        const loggerStub = sinon.createStubInstance(SoloLogger)
        const k8Stub = sinon.createStubInstance(K8);
        const kubeConfigStub = sinon.createStubInstance(KubeConfig)
        k8Stub.getKubeConfig.returns(kubeConfigStub);

        return {
            logger: loggerStub,
            helm: sinon.createStubInstance(Helm),
            k8: k8Stub,
            chartManager: sinon.createStubInstance(ChartManager),
            configManager: sinon.createStubInstance(ConfigManager),
            depManager: sinon.createStubInstance(DependencyManager),
            localConfig: new LocalConfig(filePath, loggerStub),
            downloader: sinon.createStubInstance(PackageDownloader),
            keyManager: sinon.createStubInstance(KeyManager),
            accountManager: sinon.createStubInstance(AccountManager),
            platformInstaller: sinon.createStubInstance(PlatformInstaller),
            profileManager: sinon.createStubInstance(ProfileManager),
            leaseManager: sinon.createStubInstance(LeaseManager),
            certificateManager: sinon.createStubInstance(CertificateManager),
        } as Opts
    }

    describe('updateLocalConfig', () => {
        let tasks: ContextCommandTasks;
        let command: BaseCommand;
        let loggerStub: Sinon.SinonStubbedInstance<SoloLogger>;
        let localConfig: LocalConfig;

        async function runUpdateLocalConfigTask(argv) {
            const taskObj = tasks.updateLocalConfig(argv)
            const taskStub = sinon.stub()
            await taskObj.task({}, sinon.stub())
            return taskStub
        }

        afterEach(async () => {
            await fs.promises.unlink(filePath)
        })

        beforeEach( async () => {
            loggerStub = sinon.createStubInstance(SoloLogger)
            await fs.promises.writeFile(filePath, stringify(testLocalConfigData))
            command = new BaseCommand(getBaseCommandOpts())
            tasks = new ContextCommandTasks(command);
        });

        it('should update local configuration with provided values', async () => {
            const argv = {
                [flags.namespace.name]: 'my-other-deployment',
                [flags.clusterName.name]: 'my-cluster',
                [flags.context.name]: 'my-context',
            };

            const taskStub = await runUpdateLocalConfigTask(argv)
            localConfig = new LocalConfig(filePath, loggerStub);

            expect(localConfig.currentDeploymentName).to.equal('my-other-deployment');
            expect(localConfig.getCurrentDeployment().clusterAliases).to.deep.equal(['my-cluster']);
            expect(command.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('my-context')
        });

        it('should prompt for namespace if no value is provided', async () => {
            const argv = {
                [flags.clusterName.name]: 'my-cluster',
                [flags.context.name]: 'my-context',
            };

            runUpdateLocalConfigTask(argv)
            localConfig = new LocalConfig(filePath, loggerStub);

            expect(localConfig.currentDeploymentName).to.equal('my-other-deployment');
            expect(localConfig.getCurrentDeployment().clusterAliases).to.deep.equal(['my-cluster']);
            expect(command.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('my-context')
        });

        it.only('should prompt for cluster if no value is provided', async () => {
            const argv = {
                [flags.namespace.name]: 'my-other-deployment',
                [flags.context.name]: 'my-context',
            };

            const taskStub = await runUpdateLocalConfigTask(argv)
            localConfig = new LocalConfig(filePath, loggerStub);

            expect(localConfig.currentDeploymentName).to.equal('my-other-deployment');

            expect(taskStub).to.have.been.calledWith('my-context')

            expect(localConfig.getCurrentDeployment().clusterAliases).to.deep.equal(['my-cluster']);
            expect(command.getK8().getKubeConfig().setCurrentContext).to.have.been.calledWith('my-context')

        });

        it('should prompt for context if no value is provided', async () => {
            const argv = {
                [flags.namespace.name]: 'my-other-deployment',
                [flags.clusterName.name]: 'my-cluster',
            };

            const taskStub = await runUpdateLocalConfigTask(argv)
            localConfig = new LocalConfig(filePath, loggerStub);


        });

        it('should use context from clusterMappings if no value is provided and quiet=true', async () => {
            const argv = {
                [flags.namespace.name]: 'my-other-deployment',
                [flags.clusterName.name]: 'my-cluster',
                [flags.quiet.name]: 'true',
            };

            const taskStub = await runUpdateLocalConfigTask(argv)
            localConfig = new LocalConfig(filePath, loggerStub);


        });

        it('should use cluster from kubectl if no value is provided and quiet=true', async () => {
            const argv = {
                [flags.namespace.name]: 'my-other-deployment',
                [flags.context.name]: 'my-context',
                [flags.quiet.name]: 'true',
            };

            const taskStub = await runUpdateLocalConfigTask(argv)
            localConfig = new LocalConfig(filePath, loggerStub);


        });

        it('should use namespace from kubectl if no value is provided and quiet=true', async () => {
            const argv = {
                [flags.namespace.name]: 'my-other-deployment',
                [flags.context.name]: 'my-context',
                [flags.quiet.name]: 'true',
            };

            const taskStub = await runUpdateLocalConfigTask(argv)
            localConfig = new LocalConfig(filePath, loggerStub);


        });

        it('should update clusterMappings with provided context if force=true', async () => {
            const argv = {
                [flags.namespace.name]: 'my-other-deployment',
                [flags.clusterName.name]: 'my-cluster',
                [flags.context.name]: 'provided-context',
                [flags.force.name]: 'true',
            };

            const taskStub = await runUpdateLocalConfigTask(argv)
            localConfig = new LocalConfig(filePath, loggerStub);

        });
    });
})
