// SPDX-License-Identifier: Apache-2.0

// Minimal ESLint SARIF formatter for uploading lint results to Codacy (codacy-cli-v2 `upload`).
// Codacy maps the run to its ESLint9 tool from driver name "ESLint" plus the major of driver version.
// ponytail: in-repo instead of @microsoft/eslint-formatter-sarif, which pulls in eslint 8 as a hard dependency.
import {pathToFileURL} from 'node:url';
import {ESLint} from 'eslint';

export default function (results) {
  return JSON.stringify({
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {driver: {name: 'ESLint', version: ESLint.version, informationUri: 'https://eslint.org'}},
        // every linted file is listed, so Codacy also sees files whose issues were fixed
        artifacts: results.map(result => ({location: {uri: pathToFileURL(result.filePath).href}})),
        results: results.flatMap(result =>
          result.messages
            .filter(message => message.ruleId) // parse errors have no rule and cannot map to a Codacy pattern
            .map(message => ({
              ruleId: message.ruleId,
              level: message.severity === 2 ? 'error' : 'warning',
              message: {text: message.message},
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: {uri: pathToFileURL(result.filePath).href},
                    region: {startLine: message.line ?? 1, startColumn: message.column ?? 1},
                  },
                },
              ],
            })),
        ),
      },
    ],
  });
}
