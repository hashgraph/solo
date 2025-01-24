import {inject, injectable} from "tsyringe-neo";
import {SoloLogger} from "./logging.js";
import {patchInject} from "./container_helper.js";
import {Listr} from "listr2";
import {SoloError} from "./errors.js";
import {Lease} from "./lease/lease.js";
import * as constants from "./constants.js";
import fs from "fs";
import {Task} from "./task.js";
import type {CommandFlag} from "../types/flag_types.js";
import * as helpers from "./helpers.js";
import {ConfigManager} from "./config_manager.js";

@injectable()
export class CommandHandler {
    protected readonly _configMaps = new Map<string, any>();

    constructor(
        @inject(SoloLogger) public readonly logger?: SoloLogger,
        @inject(ConfigManager) private readonly configManager?: ConfigManager,
    ) {
        this.logger = patchInject(logger, SoloLogger, this.constructor.name);
        this.configManager = patchInject(configManager, ConfigManager, this.constructor.name);
    }

    commandActionBuilder(actionTasks: any, options: any, errorString: string, lease: Lease | null) {
        return async function (argv: any, commandDef) {
            const tasks = new Listr([...actionTasks], options);

            try {
                await tasks.run();
            } catch (e: Error | any) {
                commandDef.logger.error(`${errorString}: ${e.message}`, e);
                throw new SoloError(`${errorString}: ${e.message}`, e);
            } finally {
                const promises = [];

                if(commandDef.accountManager) {
                    promises.push(commandDef.accountManager.close());
                }

                if (lease) promises.push(lease.release());
                await Promise.all(promises);
            }
        };
    }


    /**
     * Setup home directories
     * @param dirs a list of directories that need to be created in sequence
     */
    setupHomeDirectory(
        dirs: string[] = [
            constants.SOLO_HOME_DIR,
            constants.SOLO_LOGS_DIR,
            constants.SOLO_CACHE_DIR,
            constants.SOLO_VALUES_DIR,
        ],
    ) {
        const self = this;

        try {
            dirs.forEach(dirPath => {
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, {recursive: true});
                }
                self.logger.debug(`OK: setup directory: ${dirPath}`);
            });
        } catch (e: Error | any) {
            self.logger.error(e);
            throw new SoloError(`failed to create directory: ${e.message}`, e);
        }

        return dirs;
    }

    setupHomeDirectoryTask() {
        return new Task('Setup home directory', async () => {
            this.setupHomeDirectory();
        });
    }

    // Config related methods:
    getConfig(configName: string, flags: CommandFlag[], extraProperties: string[] = []): object {
        return helpers.getConfig(this.configManager, this._configMaps, configName, flags, extraProperties);
    }

    getUnusedConfigs(configName: string): string[] {
        return this._configMaps.get(configName).getUnusedConfigs();
    }
}
