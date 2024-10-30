import { LocalConfiguration } from '../../../src/core/LocalConfiguration.ts';
import fs from 'fs';
import { stringify } from 'yaml';
import {expect} from "chai";
import {Deployments, EmailAddress, LocalConfig} from "../../../src/types/index.js";

describe.only('LocalConfiguration', () => {
    let localConfig;
    const filePath = 'test-config.yaml';
    const config = {
        userEmailAddress: 'john.doe@example.com',
        deployments: {
            'my-deployment': {
                clusterAliases: ['cluster-1', 'cluster-2'],
            }
        },
        currentDeploymentName: 'my-deployment',
        clusterMappings: {
            'cluster-1': 'context-1',
            'cluster-2': 'context-2',
        }
    };

    beforeEach(async () => {
        localConfig = new LocalConfiguration(filePath);
        await fs.promises.writeFile(filePath, stringify(config));
    });

    afterEach(async () => {
        await fs.promises.unlink(filePath);
    });

    it('should load config from file', async () => {
        const loadedConfig = await localConfig.loadConfig();
        expect(loadedConfig).to.deep.eq(config);
    });

    it('should save config to file', async () => {
        const newConfig = {
            userEmailAddress: 'jane.doe@example.com',
            deployments: {
                'my-new-deployment': {
                    clusterAliases: ['cluster-3', 'cluster-4'],
                }
            },
            currentDeploymentName: 'my-new-deployment',
            clusterMappings: {
                'cluster-3': 'context-3',
                'cluster-4': 'context-4',
            },
        };
        await localConfig.setConfig(newConfig);
        await localConfig.saveConfig();
        const savedConfig = await LocalConfiguration.parseFromYamlFile(filePath)
        expect(savedConfig).to.deep.eq(newConfig);
    });

    it('should get user email address', async () => {
        const emailAddress = await localConfig.getUserEmailAddress();
        expect(emailAddress).to.eq(config.userEmailAddress);
    });

    it('should get deployments', async () => {
        const deployments = await localConfig.getDeployments();
        expect(deployments).to.deep.eq(config.deployments);
    });

    it('should get context mappings', async () => {
        const clusterMappings = await localConfig.getClusterMappings();
        expect(clusterMappings).to.deep.eq(config.clusterMappings);
    });

    it('should set user email address', async () => {
        const newEmailAddress = 'jane.doe@example.com' as EmailAddress;
        await localConfig.setUserEmailAddress(newEmailAddress);
        const updatedEmailAddress = await localConfig.getUserEmailAddress();
        expect(updatedEmailAddress).to.eq(newEmailAddress);

        await localConfig.saveConfig();
        const savedConfig = await LocalConfiguration.parseFromYamlFile(filePath)
        expect(savedConfig.userEmailAddress).to.eq(newEmailAddress);
    });

    it('should set deployments', async () => {
        const newDeployments = {
            'my-new-deployment': {
                clusterAliases: ['cluster-3', 'cluster-4'],
            }
        }
        await localConfig.setDeployments(newDeployments);
        const updatedDeployments = await localConfig.getDeployments();
        expect(updatedDeployments).to.deep.eq(newDeployments);

        await localConfig.saveConfig();
        const savedConfig = await LocalConfiguration.parseFromYamlFile(filePath)
        expect(savedConfig.deployments).to.eq(newDeployments);
    });

    it('should set context mappings', async () => {
        const newClusterMappings = {
            'cluster-3': 'context-3',
            'cluster-4': 'context-4',
        };
        await localConfig.setClusterMappings(newClusterMappings);
        const updatedClusterMappings = await localConfig.getClusterMappings();
        expect(updatedClusterMappings).to.eq(newClusterMappings);

        await localConfig.saveConfig();
        const savedConfig = await LocalConfiguration.parseFromYamlFile(filePath)
        expect(savedConfig.clusterMappings).to.eq(newClusterMappings);
    });

    it('should get current deployment', async () => {
        const currentDeployment = await localConfig.getCurrentDeployment();
        expect(currentDeployment).to.eq(config.deployments[config.currentDeploymentName]);
    });

    it('should set current deployment', async () => {
        const newCurrentDeployment = 'my-new-deployment';
        await localConfig.setCurrentDeployment(newCurrentDeployment);

        const updatedCurrentDeploymentName = await localConfig.getCurrentDeploymentName();
        expect(updatedCurrentDeploymentName).to.eq(newCurrentDeployment);

        await localConfig.saveConfig();
        const savedConfig = await LocalConfiguration.parseFromYamlFile(filePath)
        expect(savedConfig.currentDeploymentName).to.eq(newCurrentDeployment);
    });

    it('should get file path', async () => {
        const filePathFromConfig = await localConfig.getFilePath();
        expect(filePath).to.eq(filePathFromConfig);
    });

    it('should set file path', async () => {
        const newFilePath = 'new-path.yaml';
        await localConfig.setFilePath(newFilePath);
        expect(localConfig.getFilePath()).to.eq(newFilePath);
    });

    it('should throw an error if file path is not set', async () => {
        expect(new LocalConfiguration('')).to.be.rejectedWith('MissingArgumentError: a valid filePath is required');
    });

    it('should throw an error if file does not exist', async () => {
        const localConfig = new LocalConfiguration('non-existent-file.yaml');
        await expect(localConfig.loadConfig()).to.be.rejectedWith('Local config file not found: non-existent-file.yaml');
    });

    it('should throw an error if file is not a valid YAML', async () => {
        await fs.promises.writeFile(filePath, ' invalid YAML ');
        await expect(localConfig.loadConfig()).to.be.rejectedWith('Cannot convert undefined or null to object');
    });
});