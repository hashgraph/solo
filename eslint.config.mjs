// SPDX-License-Identifier: Apache-2.0

import globals from 'globals';
import eslintJs from '@eslint/js';
import nodePlugin from 'eslint-plugin-n';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import tsEslint from 'typescript-eslint';
import headers from 'eslint-plugin-headers';
import tsdoc from 'eslint-plugin-tsdoc';
// eslint-disable-next-line n/no-unpublished-import
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  eslintJs.configs.recommended,
  nodePlugin.configs['flat/recommended'],
  eslintConfigPrettier,
  ...tsEslint.configs.recommended.map(config => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  {
    ignores: ['docs/**/*', 'dist/*', '**/dist/*'],
  },
  {
    // all files not excluded, mostly js files
    languageOptions: {
      globals: {
        ...globals.mocha,
        ...globals.node,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      n: nodePlugin,
      prettier: eslintPluginPrettier,
      headers: headers,
    },
    rules: {
      'headers/header-format': [
        'error',
        {
          source: 'string',
          content: 'SPDX-License-Identifier: Apache-2.0',
          style: 'line',
          trailingNewlines: 2,
        },
      ],
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
      'n/no-missing-import': 'off',
      'n/no-empty-function': 'off',
      'n/no-unsupported-features/es-syntax': 'off',
      'n/no-missing-require': 'off',
      'n/hashbang': [
        'error',
        {
          additionalExecutables: ['solo.ts'],
        },
      ],
      'n/no-unpublished-import': [
        'error',
        {
          allowModules: [
            'globals',
            '@eslint/js',
            'eslint-plugin-n',
            'eslint-config-prettier',
            'eslint-plugin-prettier',
            'typescript-eslint',
            'eslint-plugin-headers',
            'eslint-plugin-tsdoc',
          ],
          convertPath: [
            {
              include: ['src/**'],
              replace: ['^src/(.+)$', 'dist/$1'],
            },
          ],
        },
      ],
      'no-dupe-class-members': 'off',
      'require-atomic-updates': 'off',
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          ignores: ['fs.cpSync', 'CryptoKey', 'fetch'],
        },
      ],
      'no-prototype-builtins': 'off',
    },
  },
  {
    // all ts files
    files: ['**/*.ts'],
    plugins: {
      tsdoc: tsdoc,
      'unused-imports': unusedImports,
    },
    languageOptions: {
      globals: {
        ...globals.mocha,
        ...globals.node,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
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
      '@typescript-eslint/consistent-type-imports': [
        // optional: assists in reducing circular dependencies
        'error',
        {
          fixStyle: 'inline-type-imports',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn', // TODO remove (771 errors)
      '@typescript-eslint/no-this-alias': [
        'error',
        {
          allowedNames: ['self'], // TODO remove (59 errors)
        },
      ],
      '@typescript-eslint/no-unused-vars': 'warn', // TODO remove (83 errors)
      'n/no-process-exit': 'warn', // TODO remove (38 errors)
      // Enforce `import {type X} from 'path';` over `import type {X} from 'path';`,
      // but allow `import type * as <name> from 'path';`
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportDeclaration[importKind='type'] ImportSpecifier",
          message: "Use `import {type X} from 'path';` instead of `import type {X} from 'path';`.",
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': 'warn',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // test ts files
    files: ['test/**/*.ts'],
    rules: {
      'no-invalid-this': ['off', {}],
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
];
