# Instructions for developers working on solo project

Below we describe how you can set up local environment and contribute to `solo`.

* Clone the repo
* In order to support ES6 modules with `jest`, set an env variable `NODE_OPTIONS` as below:
  * `export NODE_OPTIONS=--experimental-vm-modules >> ~/.zshrc`
* For Intellij users: enable `--experimental-vm-modules` for `Jest` as below:
  * Go to: `Run->Edit Configurations->Edit Configuration Templates->Jest`
  * Set: `--experimental-vm-modules` in `Node Options`.
* Run `npm i` to install the required packages
* Run `npm link` to install `solo` as the CLI
  * Note: you need to do it once. If `solo` already exists in your path, you will need to remove it first.
  * Alternative way would be to run `npm run solo-test -- <COMMAND> <ARGS>`
* Run `npm test` or `npm run test` to run the unit tests
* Run `solo` to access the CLI.
* Note that debug logs are stored at `$HOME/.solo/logs/solo.log`.
  * So you may use `tail -f $HOME/.solo/logs/solo.log | jq` in a separate terminal to keep an eye on the logs.
* Before making a commit run `npm run format`

## E2E tests

* In order to run E2E test, we need to set up cluster and install the chart.
  * Run `./test/e2e/setup-e2e.sh`
  * Run `npm run test-e2e-standard`, NOTE: this excludes some E2E tests that have their own command
  * You can check the section `scripts` in file `package.json` for more other test commands available.

* Tests are run in random order. The random seed value is shown as message such as:
  `Using timestamp seed 1711414247085 for random test order`

* If you like to rerun tests with the same seed, use environment variable `RANDOM_SEED=<integer_number>` with `npm run test-e2e-standard` command.
  * Example: `RANDOM_SEED=20 npm run test-e2e-standard`,
    and you should see an output like: `Using preset seed 20 for random test order`
