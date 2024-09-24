import {constants} from "../../core/index.mjs";
import {FREEZE_ADMIN_ACCOUNT} from "../../core/constants.mjs";
import {AccountBalanceQuery, FreezeTransaction, FreezeType, Timestamp} from "@hashgraph/sdk";
import {FullstackTestingError, IllegalArgumentError} from "../../core/errors.mjs";

class Task {
    constructor(title, taskFunc) {
        return {
            title,
            task: taskFunc
        }
    }
}

export class NodeCommandTasks {
    /**
     * @param {{logger: Logger, accountManager: AccountManager}} opts
     */
    constructor (opts) {
        if (!opts || !opts.accountManager) throw new IllegalArgumentError('An instance of core/AccountManager is required', opts.accountManager)
        if (!opts || !opts.logger) throw new Error('An instance of core/Logger is required')

        this.logger = opts.logger
        this.accountManager = opts.accountManager
    }

    sendPrepareUpgradeTransaction() {
        return new Task('Send prepare upgrade transaction', async (ctx, task) => {
            const {freezeAdminPrivateKey, upgradeZipHash, client} = ctx.config
            try {
                // transfer some tiny amount to the freeze admin account
                await this.accountManager.transferAmount(constants.TREASURY_ACCOUNT_ID, FREEZE_ADMIN_ACCOUNT, 100000)

                // query the balance
                const balance = await new AccountBalanceQuery()
                    .setAccountId(FREEZE_ADMIN_ACCOUNT)
                    .execute(this.accountManager._nodeClient)
                this.logger.debug(`Freeze admin account balance: ${balance.hbars}`)

                // set operator of freeze transaction as freeze admin account
                client.setOperator(FREEZE_ADMIN_ACCOUNT, freezeAdminPrivateKey)

                const prepareUpgradeTx = await new FreezeTransaction()
                    .setFreezeType(FreezeType.PrepareUpgrade)
                    .setFileId(constants.UPGRADE_FILE_ID)
                    .setFileHash(upgradeZipHash)
                    .freezeWith(client)
                    .execute(client)

                const prepareUpgradeReceipt = await prepareUpgradeTx.getReceipt(client)

                this.logger.debug(
                    `sent prepare upgrade transaction [id: ${prepareUpgradeTx.transactionId.toString()}]`,
                    prepareUpgradeReceipt.status.toString()
                )
            } catch (e) {
                this.logger.error(`Error in prepare upgrade: ${e.message}`, e)
                throw new FullstackTestingError(`Error in prepare upgrade: ${e.message}`, e)
            }
        })
    }

    sendFreezeUpgradeTransaction() {
        return new Task('Send freeze upgrade transaction', async (ctx, task) => {
            const {freezeAdminPrivateKey, upgradeZipHash, client} = ctx.config
            try {
                const futureDate = new Date()
                this.logger.debug(`Current time: ${futureDate}`)

                futureDate.setTime(futureDate.getTime() + 5000) // 5 seconds in the future
                this.logger.debug(`Freeze time: ${futureDate}`)

                client.setOperator(FREEZE_ADMIN_ACCOUNT, freezeAdminPrivateKey)
                const freezeUpgradeTx = await new FreezeTransaction()
                    .setFreezeType(FreezeType.FreezeUpgrade)
                    .setStartTimestamp(Timestamp.fromDate(futureDate))
                    .setFileId(constants.UPGRADE_FILE_ID)
                    .setFileHash(upgradeZipHash)
                    .freezeWith(client)
                    .execute(client)

                const freezeUpgradeReceipt = await freezeUpgradeTx.getReceipt(client)
                this.logger.debug(`Upgrade frozen with transaction id: ${freezeUpgradeTx.transactionId.toString()}`,
                    freezeUpgradeReceipt.status.toString())
            } catch (e) {
                this.logger.error(`Error in freeze upgrade: ${e.message}`, e)
                throw new FullstackTestingError(`Error in freeze upgrade: ${e.message}`, e)
            }
        })
    }
}