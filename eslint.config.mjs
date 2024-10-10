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
import headers from 'eslint-plugin-headers'
import globals from 'globals'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
})
export default [...compat.extends('standard'), {
  files: ['**/*.mjs'],
  ignores: ['docs/**/*'],
  plugins: {
    headers
  },
  languageOptions: {
    globals: {
      ...globals.browser,
      ...globals.mocha
    },
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'no-unused-vars': 'error',
    'require-await': 'error',
    'no-template-curly-in-string': 'off',
    'headers/header-format': ['error', {
      source: 'string',
      variables: {
        year: '2024'
      },
      content: 'Copyright (C) {year} Hedera Hashgraph, LLC\n\nLicensed under the Apache License, Version 2.0 (the ""License"");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\n     http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software\ndistributed under the License is distributed on an ""AS IS"" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\nSee the License for the specific language governing permissions and\nlimitations under the License.\n'
    }]
  }
},
{
  files: ['test/**/*.*js'],
  rules: {
    'no-unused-expressions': 'off'
  }
}]
