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
import eslintJs from "@eslint/js";
import nodePlugin from "eslint-plugin-n"
import eslintConfigPrettier from 'eslint-config-prettier'
import eslintPluginPrettier from 'eslint-plugin-prettier'
import tsEslint from "typescript-eslint";
import headers from 'eslint-plugin-headers'
import tsdoc from "eslint-plugin-tsdoc"

export default [
  eslintJs.configs.recommended,
  nodePlugin.configs['flat/recommended'],
  eslintConfigPrettier,
  // ...tsEslint.configs.strict,
  // ...tsEslint.configs.recommended,
  // ...tsEslint.configs.stylistic,
  ...tsEslint.configs.recommended.map(config => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  {
    ignores: ['docs/**/*', 'dist/*'],
  },
  { // all files not excluded, mostly js files
    languageOptions: {
      globals: {
        ...globals.mocha,
        ...globals.node,
      },
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    plugins: {
      n: nodePlugin,
      prettier: eslintPluginPrettier,
      headers: headers,
    },
    rules: {
      'headers/header-format': ['error', {
        source: 'string',
        variables: {
          year: '2024'
        },
        content: 'Copyright (C) {year} Hedera Hashgraph, LLC\n\nLicensed under the Apache License, Version 2.0 (the ""License"");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\n     http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software\ndistributed under the License is distributed on an ""AS IS"" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\nSee the License for the specific language governing permissions and\nlimitations under the License.\n'
      }],
      'prettier/prettier': 'error',
      'block-scoped-var': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'eol-last': 'error',
      'prefer-arrow-callback': 'error',
      'no-trailing-spaces': 'error',
      quotes: ['warn', 'single', {avoidEscape: true}],
      'no-restricted-properties': [
        'error',
        {
          object: 'describe',
          property: 'only',
        },
        {
          object: 'it',
          property: 'only',
        },
      ],
    },
    // rules: {
    //   '@typescript-eslint/no-unused-expressions': 'off',
    //   '@typescript-eslint/ban-ts-comment': 'off',
    //   '@typescript-eslint/no-explicit-any': 'off',
    //   '@typescript-eslint/no-this-alias': 'off',
    //   '@typescript-eslint/no-unsafe-function-type': 'off',
    //   '@typescript-eslint/no-unused-vars': 'off',
    //   'no-unused-vars': 'off',
    //   'no-empty': 'off',
    //   '@typescript-eslint/no-extraneous-class': 'off',
    //   '@typescript-eslint/no-non-null-assertion': 'off',
    //   'no-duplicate-imports': 'off'
    // },
  },
  { // all ts files
    files: ['**/*.ts'],
    plugins: {
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
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-warning-comments': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/camelcase': 'off',
      'n/no-missing-import': 'off',
      'n/no-empty-function': 'off',
      'n/no-unsupported-features/es-syntax': 'off',
      'n/no-missing-require': 'off',
      'n/shebang': 'off',
      'n/no-unpublished-import': [
        'error',
        {
          convertPath: [
            {
              include: ['src/**'],
              replace: ['^src/(.+)$', 'build/$1'],
            },
          ],
        },
      ],
      'no-dupe-class-members': 'off',
      'require-atomic-updates': 'off',
    },
    // rules: {
    //   'tsdoc/syntax':'warn',
    //   'no-template-curly-in-string': 'off',
    //   'headers/header-format': ['error', {
    //     source: 'string',
    //     variables: {
    //       year: '2024'
    //     },
    //     content: 'Copyright (C) {year} Hedera Hashgraph, LLC\n\nLicensed under the Apache License, Version 2.0 (the ""License"");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\n     http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software\ndistributed under the License is distributed on an ""AS IS"" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\nSee the License for the specific language governing permissions and\nlimitations under the License.\n'
    //   }],
    //   'quotes': ['error', 'single', { 'avoidEscape': true }],
    //   'semi': ['error', 'never'],
    //   'no-duplicate-imports': ['error'],
    //   'object-curly-spacing': ["error", "always"],
    //   eqeqeq: "error",
    //   'dot-notation': 'error',
    //   'no-promise-executor-return': 'error',
    //   'no-unneeded-ternary': 'error',
    //   'no-shadow-restricted-names': 'error',
    //   'no-else-return': 'error',
    //   '@typescript-eslint/array-type': [ 'error', { default: 'array' } ],
    //   '@typescript-eslint/consistent-generic-constructors': 'error',
    //   '@typescript-eslint/consistent-indexed-object-style': [ 'error', 'record' ],
    //   "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: 'inline-type-imports'}],
    //   'space-before-function-paren': 'error',
    //   '@typescript-eslint/no-empty-function': 'off',
    //   '@typescript-eslint/class-literal-property-style': 'off',
    //   'no-invalid-this': [ 'error', { capIsConstructor : false } ],
    // },
  },
  { // test ts files
    files: ['test/**/*.ts'],
    rules: {
      'no-invalid-this': [ 'off', { } ],
    }
  },
]
