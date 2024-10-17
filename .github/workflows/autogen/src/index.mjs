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
'use strict'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'url'
import * as changeCase from 'change-case'

export const AUTOGENERATE_E2E_TEST_JOBS = '# {AUTOGENERATE-E2E-TEST-JOBS}'
export const AUTOGENERATE_WITH_SUBDIR = '# {AUTOGENERATE-WITH-SUBDIR}'
export const AUTOGENERATE_WITH_COVERAGE_REPORT = '# {AUTOGENERATE-WITH-COVERAGE-REPORT}'
export const AUTOGENERATE_JOB_OUTPUTS_SUB_DIRS = '# {AUTOGENERATE-JOB-OUTPUTS-SUB-DIRS}'
export const AUTOGENERATE_JOB_OUTPUTS_COVERAGE_REPORTS = '# {AUTOGENERATE-JOB-OUTPUTS-COVERAGE-REPORTS}'
export const AUTOGENERATE_WORKFLOW_OUTPUTS_SUB_DIRS = '# {AUTOGENERATE-WORKFLOW-OUTPUTS-SUB-DIRS}'
export const AUTOGENERATE_WORKFLOW_OUTPUTS_COVERAGE_REPORTS = '# {AUTOGENERATE-WORKFLOW-OUTPUTS-COVERAGE-REPORTS}'
export const AUTOGENERATE_INPUTS_SUB_DIRS = '# {AUTOGENERATE-INPUTS-SUB-DIRS}'
export const AUTOGENERATE_INPUTS_COVERAGE_REPORTS = '# {AUTOGENERATE-INPUTS-COVERAGE-REPORTS}'
export const AUTOGENERATE_DOWNLOAD_JOBS = '# {AUTOGENERATE-DOWNLOAD-JOBS}'

/**
 * @typedef {Object} Test
 * @property {string} name
 * @property {string} mochaPostfix
 */

/**
 * @typedef {Object} Config
 * @property {string} downloadArtifactAction
 * @property {string} downloadArtifactActionComment
 * @property {Test[]} tests
 */

export function main () {
  console.log('Begin autogen...')

  const __filename = fileURLToPath(import.meta.url) // get the resolved path to the file
  const __dirname = path.dirname(__filename) // get the name of the directory
  const outputDir = path.dirname(path.dirname(__dirname))
  const templateDir = path.join(outputDir, 'templates')
  const configFile = path.join(templateDir, 'config.yaml')
  const configData = fs.readFileSync(configFile, 'utf8')
  const config = /** @type {Config} **/ yaml.load(configData)

  // generate the workflows with changes
  buildWorkflows(outputDir, templateDir, config)

  // update the Solo package.json with changes
  updatePackageJson(outputDir, config)

  console.log('...end autogen')
}

/**
 * Updates the Solo package.json by auto-generating the e2e test scripts based on
 * the values in the config
 * @param {string} outputDir
 * @param {Config} config
 */
function updatePackageJson (outputDir, config) {
  const packageJsonDir = path.dirname(path.dirname(outputDir))
  const packageJsonFile = path.join(packageJsonDir, 'package.json')
  const inputData = fs.readFileSync(packageJsonFile, 'utf8')
  const inputLines = inputData.split('\n')
  const outputLines = []
  const generatedLines = []
  const firstMarker = '"test-e2e-all":'
  const secondMarker = '"solo":'
  let skipNext = false

  inputLines.forEach(line => {
    if (line.includes(firstMarker)) {
      outputLines.push(line)
      skipNext = true
      const spacePrefix = line.substring(0, line.indexOf('"test-e2e'))

      config.tests.forEach(test => {
        const formalNounName = test.name
        const kebabCase = changeCase.kebabCase(formalNounName)

        generatedLines.push(
          `${spacePrefix}"test-e2e-${kebabCase}": "cross-env ` +
          `MOCHA_SUITE_NAME=\\"Mocha E2E ${formalNounName} Tests\\" ` +
          `c8 --report-dir='coverage/e2e-${kebabCase}' ` +
          `mocha ${test.mochaPostfix} --reporter-options mochaFile=junit-e2e-${kebabCase}.xml ` +
          `--timeout ${test.timeout ?? 20000}",`)
      })

      outputLines.push(...generatedLines)
    } else if (line.includes(secondMarker)) {
      outputLines.push(line)
      skipNext = false
    } else if (skipNext) {
      // do nothing, we generate these lines after we see the firstMarker
    } else {
      outputLines.push(line)
    }
  })
  console.log(`outputFile: ${packageJsonFile}`)
  fs.writeFileSync(packageJsonFile, outputLines.join('\n'))
}

/**
 * Autogenerate the GitHub workflows files with the entries needed to add the
 * E2E test jobs
 * @param {string} outputDir
 * @param {string} templateDir
 * @param {Config} config
 */
function buildWorkflows (outputDir, templateDir, config) {
  const templates = []
  fs.readdirSync(templateDir).forEach(file => {
    if (file.substring(0, 'template'.length) === 'template') {
      templates.push(file)
    }
  })

  templates.forEach(template => {
    const templateFile = path.join(templateDir, template)
    const templateData = fs.readFileSync(templateFile, 'utf8')
    const templateLines = templateData.split('\n')
    const outputFile = path.join(outputDir, template.substring('template.'.length))
    const outputLines = []
    console.log(`outputFile: ${outputFile}`)

    templateLines.forEach(line => {
      const trimmedLine = line.trim()

      switch (trimmedLine) {
        case AUTOGENERATE_WORKFLOW_OUTPUTS_SUB_DIRS:
        case AUTOGENERATE_WORKFLOW_OUTPUTS_COVERAGE_REPORTS:
        case AUTOGENERATE_INPUTS_SUB_DIRS:
        case AUTOGENERATE_INPUTS_COVERAGE_REPORTS:
          autogenerateYaml(line, config, outputLines, trimmedLine)
          break
        case AUTOGENERATE_WITH_SUBDIR:
        case AUTOGENERATE_WITH_COVERAGE_REPORT:
        case AUTOGENERATE_JOB_OUTPUTS_SUB_DIRS:
        case AUTOGENERATE_JOB_OUTPUTS_COVERAGE_REPORTS:
        case AUTOGENERATE_E2E_TEST_JOBS:
          autogenerateLine(line, config, outputLines, trimmedLine)
          break
        case AUTOGENERATE_DOWNLOAD_JOBS:
          autogenerateLine(line, config, outputLines, trimmedLine)
          outputLines.pop() // remove the extra new line character
          break
        default:
          outputLines.push(line)
      }
    })

    fs.writeFileSync(outputFile, outputLines.join('\n'))
  })
}

/**
 * Generates the YAML for the provided templateKey
 * @param {string} line
 * @param {Config} config
 * @param {string[]} outputLines
 * @param {string} templateKey
 */
export function autogenerateYaml (line, config, outputLines, templateKey) {
  const spacePrefix = line.substring(0,
    line.indexOf(templateKey))
  let suppressEmptyLines = false

  config.tests.forEach(test => {
    const outputYaml = {}

    switch (templateKey) {
      default:
        generateOutputs(test, templateKey, outputYaml)
        suppressEmptyLines = true
    }

    const yamlLines = yaml.dump(outputYaml, { lineWidth: -1, quotingType: '"' }).split('\n')

    yamlLines.forEach(function (line) {
      line = line.replaceAll('¡', '"')
      if (/^\s*$/.test(line)) {
        if (!suppressEmptyLines) {
          outputLines.push(line)
        }
      } else {
        outputLines.push(`${spacePrefix}${line}`)
      }
    })
  })

  if (!suppressEmptyLines) {
    outputLines.pop() // remove the extra new line character
  }
}

/**
 * Generates the output lines for the provided templateKey
 * @param {Test} test
 * @param {string} templateKey
 * @param {Object} outputYaml
 */
export function generateOutputs (test, templateKey, outputYaml) {
  const formalNounName = test.name
  const kebabCase = changeCase.kebabCase(formalNounName)
  const snakeCase = changeCase.snakeCase(formalNounName)
  let outputKey
  const outputValue = {}

  switch (templateKey) {
    case AUTOGENERATE_WORKFLOW_OUTPUTS_SUB_DIRS:
      outputKey = `e2e-${kebabCase}-test-subdir`
      outputValue.description = `¡E2E ${formalNounName} Test Subdirectory¡`
      outputValue.value = '${{ jobs.env-vars.outputs.e2e_' + snakeCase + '_test_subdir }}'
      break
    case AUTOGENERATE_WORKFLOW_OUTPUTS_COVERAGE_REPORTS:
      outputKey = `e2e-${kebabCase}-coverage-report`
      outputValue.description = `¡E2E ${formalNounName} Tests Coverage Report¡`
      outputValue.value = '${{ jobs.env-vars.outputs.e2e_' + snakeCase +
          '_coverage_report }}'
      break
    case AUTOGENERATE_INPUTS_SUB_DIRS:
      outputKey = `e2e-${kebabCase}-test-subdir`
      outputValue.description = `¡E2E ${formalNounName} Test Subdirectory:¡`
      outputValue.type = 'string'
      outputValue.required = false
      outputValue.default = `¡e2e-${kebabCase}¡`
      break
    case AUTOGENERATE_INPUTS_COVERAGE_REPORTS:
      outputKey = `e2e-${kebabCase}-coverage-report`
      outputValue.description = `¡E2E ${formalNounName} Coverage Report:¡`
      outputValue.type = 'string'
      outputValue.required = false
      outputValue.default = `¡E2E ${formalNounName} Tests Coverage Report¡`
  }

  outputYaml[outputKey] = outputValue
}

/**
 * Generates the output line for the provided templateKey
 * @param {string} line
 * @param {Config} config
 * @param {string[]} outputLines
 * @param {string} templateKey
 */
export function autogenerateLine (line, config, outputLines, templateKey) {
  const spacePrefix = line.substring(0,
    line.indexOf(templateKey))

  config.tests.forEach(test => {
    const formalNounName = test.name
    const kebabCase = changeCase.kebabCase(formalNounName)
    const snakeCase = changeCase.snakeCase(formalNounName)
    let namePart
    let namePart2

    switch (templateKey) {
      case AUTOGENERATE_WITH_SUBDIR:
        namePart = `e2e-${kebabCase}-test`
        outputLines.push(spacePrefix + namePart + '-subdir: ${{ needs.env-vars.outputs.' + namePart + '-subdir }}')
        break
      case AUTOGENERATE_WITH_COVERAGE_REPORT:
        namePart = `e2e-${kebabCase}`
        outputLines.push(spacePrefix + namePart + '-coverage-report: ${{ needs.env-vars.outputs.' + namePart + '-coverage-report }}')
        break
      case AUTOGENERATE_JOB_OUTPUTS_SUB_DIRS:
        namePart = `e2e_${snakeCase}_test_subdir`
        namePart2 = `e2e-${kebabCase}`
        outputLines.push(`${spacePrefix}${namePart}: ${namePart2}`)
        break
      case AUTOGENERATE_JOB_OUTPUTS_COVERAGE_REPORTS:
        namePart = `e2e_${snakeCase}_coverage_report`
        outputLines.push(`${spacePrefix}${namePart}: "E2E ${formalNounName} Tests Coverage Report"`)
        break
      case AUTOGENERATE_DOWNLOAD_JOBS:
        outputLines.push(`${spacePrefix}- name: Download E2E ${formalNounName} Coverage Report`)
        outputLines.push(`${spacePrefix}  uses: ${config.downloadArtifactAction} # ${config.downloadArtifactActionComment}`)
        outputLines.push(spacePrefix + '  if: ${{ (inputs.enable-codecov-analysis || inputs.enable-codacy-coverage) && inputs.enable-e2e-coverage-report && !cancelled() && !failure() }}')
        outputLines.push(`${spacePrefix}  with:`)
        outputLines.push(spacePrefix + '    name: ${{ inputs.e2e-' + kebabCase + '-coverage-report }}')
        outputLines.push(spacePrefix + '    path: \'coverage/${{ inputs.e2e-' + kebabCase + '-test-subdir }}\'')
        outputLines.push('')
        break
      case AUTOGENERATE_E2E_TEST_JOBS:
        outputLines.push(spacePrefix + '- { name: "' + formalNounName +
            '", npm-test-script: "test-${{ needs.env-vars.outputs.e2e-' + kebabCase +
            '-test-subdir }}", coverage-subdirectory: "${{ needs.env-vars.outputs.e2e-' + kebabCase +
            '-test-subdir }}", coverage-report-name: "${{ needs.env-vars.outputs.e2e-' + kebabCase +
            '-coverage-report }}" }')
    }
  })
}
