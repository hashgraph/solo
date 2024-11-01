import { LocalConfiguration } from '../../../src/core/config/LocalConfiguration.ts';
import fs from 'fs';
import { stringify } from 'yaml';
import {expect} from "chai";
import {MissingArgumentError, SoloError} from "../../../src/core/errors.ts";

describe('LocalConfiguration', () => {
    let localConfig;
    const filePath = 'test-config.yaml';
    const config = {
        userEmailAddress: 'john.doe@example.com',
        deployments: {
            'my-deployment': {
                clusterAliases: ['cluster-1', 'context-1'],
            },
            'my-other-deployment': {
                clusterAliases: ['cluster-2', 'context-2'],
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
        const loadedConfig = await localConfig.getConfig();
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
        const savedConfig = await LocalConfiguration.parseFromFile(filePath)
        expect(savedConfig).to.deep.eq(newConfig);
    });

    it('should get user email address', async () => {
        const emailAddress = (await localConfig.getConfig()).userEmailAddress;
        expect(emailAddress).to.eq(config.userEmailAddress);
    });

    it('should get deployments', async () => {
        const deployments = (await localConfig.getConfig()).deployments;
        expect(deployments).to.deep.eq(config.deployments);
    });

    it('should get context mappings', async () => {
        const clusterMappings = (await localConfig.getConfig()).clusterMappings;
        expect(clusterMappings).to.deep.eq(config.clusterMappings);
    });

    it('should set user email address', async () => {
        const newEmailAddress = 'jane.doe@example.com';
        (await localConfig.getConfig()).setUserEmailAddress(newEmailAddress);
        const updatedEmailAddress = (await localConfig.getConfig()).userEmailAddress;
        expect(updatedEmailAddress).to.eq(newEmailAddress);

        await localConfig.saveConfig();
        const savedConfig = await LocalConfiguration.parseFromFile(filePath)
        expect(savedConfig.userEmailAddress).to.eq(newEmailAddress);
    });

    it('should not set an invalid email as user email address', async () => {
        try {
            await (await localConfig.getConfig()).setUserEmailAddress('invalidEmail');
            expect.fail('expected an error to be thrown');
        } catch (error) {
            expect(error).to.be.instanceOf(SoloError);
        }
    });

    it('should set deployments', async () => {
        const newDeployments = {
            'my-deployment': {
                clusterAliases: ['cluster-1', 'context-1'],
            },
            'my-new-deployment': {
                clusterAliases: ['cluster-3', 'context-3'],
            }
        };

        (await localConfig.getConfig()).setDeployments(newDeployments);
        const updatedDeployments = (await localConfig.getConfig()).deployments;
        expect(updatedDeployments).to.deep.eq(newDeployments);

        await localConfig.saveConfig();
        const savedConfig = await LocalConfiguration.parseFromFile(filePath)
        expect(savedConfig.deployments).to.deep.eq(newDeployments);
    });

    it('should not set invalid deployments', async () => {
        const invalidDeployments = {
            'valid-deployment': {
                clusterAliases: ['cluster-3', 'cluster-4'],
            },
            'invalid-deployment': {
                foo: ['bar'],
            },
        };

        try {
            (await localConfig.getConfig()).setDeployments(invalidDeployments)
            expect.fail('expected an error to be thrown');
        } catch (error) {
            expect(error).to.be.instanceOf(SoloError);
        }
    });

    it('should set context mappings', async () => {
        const newClusterMappings = {
            'cluster-3': 'context-3',
            'cluster-4': 'context-4',
        };
        (await localConfig.getConfig()).setClusterMappings(newClusterMappings);
        const updatedClusterMappings = (await localConfig.getConfig()).clusterMappings;
        expect(updatedClusterMappings).to.eq(newClusterMappings);

        await localConfig.saveConfig();
        const savedConfig = await LocalConfiguration.parseFromFile(filePath)
        expect(savedConfig.clusterMappings).to.deep.eq(newClusterMappings);
    });

    it('should not set invalid context mappings', async () => {
        const invalidContextMappings = {
            'cluster-3': 'context-3',
            'invalid-cluster': 5,
        }

        try {
            (await localConfig.getConfig()).setContextMappings(invalidContextMappings)
            expect.fail('expected an error to be thrown');
        } catch (error) {
            expect(error).to.be.instanceOf(TypeError);
        }
    });

    it('should get current deployment', async () => {
        const currentDeployment = (await localConfig.getConfig()).getCurrentDeployment();
        expect(currentDeployment).to.deep.eq(config.deployments[config.currentDeploymentName]);
    });

    it('should set current deployment', async () => {
        const newCurrentDeployment = 'my-other-deployment';
        (await localConfig.getConfig()).setCurrentDeployment(newCurrentDeployment);

        const updatedCurrentDeploymentName = (await localConfig.getConfig()).currentDeploymentName;
        expect(updatedCurrentDeploymentName).to.eq(newCurrentDeployment);

        await localConfig.saveConfig();
        const savedConfig = await LocalConfiguration.parseFromFile(filePath)
        expect(savedConfig.currentDeploymentName).to.eq(newCurrentDeployment);
    });

    it('should not set invalid or non-existent current deployment', async () => {
        const invalidCurrentDeploymentName = 5;
        try {
            (await localConfig.getConfig()).setCurrentDeployment(invalidCurrentDeploymentName)
            expect.fail('expected an error to be thrown');
        } catch (error) {
            expect(error).to.be.instanceOf(SoloError);
        }

        const nonExistentCurrentDeploymentName = 'non-existent-deployment';
        try {
            (await localConfig.getConfig()).setCurrentDeployment(nonExistentCurrentDeploymentName)
            expect.fail('expected an error to be thrown');
        } catch (error) {
            expect(error).to.be.instanceOf(SoloError);
        }
    });

    it('should throw an error if file path is not set', async () => {
        try {
            new LocalConfiguration('');
            expect.fail('Expected an error to be thrown');
        } catch (error) {
            expect(error).to.be.instanceOf(MissingArgumentError);
            expect(error.message).to.equal('a valid filePath is required');
        }
    });

    it('should throw an error if file does not exist', async () => {
        const localConfig = new LocalConfiguration('non-existent-file.yaml');
        await expect(localConfig.getConfig()).to.be.rejectedWith('Local config file not found: non-existent-file.yaml');
    });

    it('should throw a validation error if the config is not a valid LocalConfig', async () => {
        // without any known properties
        await fs.promises.writeFile(filePath, 'foo: bar');
        await expect(localConfig.getConfig()).to.be.rejected;

        // with extra property
        await fs.promises.writeFile(filePath, stringify({...config, foo: 'bar'}));
        await expect(localConfig.getConfig()).to.be.rejected;
    });

    it('should throw a validation error if userEmailAddress is not a valid email', async () => {
        await fs.promises.writeFile(filePath, stringify({...config, userEmailAddress: 'foo'}));
        await expect(localConfig.getConfig()).to.be.rejected;

        await fs.promises.writeFile(filePath, stringify({...config, userEmailAddress: 5}));
        await expect(localConfig.getConfig()).to.be.rejected;
    });

    it('should throw a validation error if deployments format is not correct', async () => {
        await fs.promises.writeFile(filePath, stringify({...config, deployments: 'foo'}));
        await expect(localConfig.getConfig()).to.be.rejected;

        await fs.promises.writeFile(filePath, stringify({...config, deployments: {'foo': 'bar'}}));
        await expect(localConfig.getConfig()).to.be.rejected;

        await fs.promises.writeFile(filePath, stringify({
                ...config,
                deployments: [{'foo': 'bar'}]
            })
        );
        await expect(localConfig.getConfig()).to.be.rejected;
    });

    it('should throw a validation error if clusterMappings format is not correct', async () => {
        await fs.promises.writeFile(filePath, stringify({...config, clusterMappings: 'foo'}));
        await expect(localConfig.getConfig()).to.be.rejected;

        await fs.promises.writeFile(filePath, stringify({...config, clusterMappings: ['foo', 'bar']}));
        await expect(localConfig.getConfig()).to.be.rejected;
    });

    it('should throw a validation error if currentDeploymentName format is not correct', async () => {
        await fs.promises.writeFile(filePath, stringify({...config, currentDeploymentName: 5}));
        await expect(localConfig.getConfig()).to.be.rejected;

        await fs.promises.writeFile(filePath, stringify({...config, currentDeploymentName: ['foo', 'bar']}));
        await expect(localConfig.getConfig()).to.be.rejected;
    });
});