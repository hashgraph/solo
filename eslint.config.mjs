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
import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import headers from 'eslint-plugin-headers'
import tsdoc from "eslint-plugin-tsdoc"

export default [
  pluginJs.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    ignores: ['docs/**/*', 'dist/*'],
  },
  {
    files: ['test/**/*.ts', 'src/**/*.ts'],
    plugins: {
      headers: headers,
      tsdoc: tsdoc,
    },
    languageOptions: {
      globals: {
        ...globals.mocha,
        ...globals.node,
      },
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      'tsdoc/syntax':'warn',
      'no-template-curly-in-string': 'off',
      'headers/header-format': ['error', {
        source: 'string',
        variables: {
          year: '2024'
        },
        content: 'Copyright (C) {year} Hedera Hashgraph, LLC\n\nLicensed under the Apache License, Version 2.0 (the ""License"");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\n     http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software\ndistributed under the License is distributed on an ""AS IS"" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\nSee the License for the specific language governing permissions and\nlimitations under the License.\n'
      }],
      'quotes': ['error', 'single', { 'avoidEscape': true }],
      'semi': ['error', 'never'],
      'no-duplicate-imports': ['error'],
      'object-curly-spacing': ["error", "always"],
      eqeqeq: "error",
      'dot-notation': 'error',
      'no-promise-executor-return': 'error',
      'no-unneeded-ternary': 'error',
      'no-shadow-restricted-names': 'error',
      'no-else-return': 'error',
      '@typescript-eslint/array-type': [ 'error', { default: 'array' } ],
      '@typescript-eslint/consistent-generic-constructors': 'error',
      '@typescript-eslint/consistent-indexed-object-style': [ 'error', 'record' ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: 'inline-type-imports'}],
      'space-before-function-paren': 'error',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/class-literal-property-style': 'off'
    }
  },
  {
    files: ['**/*'],
    languageOptions: {
      globals: {
        ...globals.mocha,
        ...globals.node,
      },
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'no-empty': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-duplicate-imports': 'off'
    },
  },
]
