// SPDX-License-Identifier: Apache-2.0

import globals from 'globals';
import eslintJs from '@eslint/js';
import nodePlugin from 'eslint-plugin-n';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import tsEslint from 'typescript-eslint';
import headers from 'eslint-plugin-headers';
import tsdoc from 'eslint-plugin-tsdoc';
import unusedImports from 'eslint-plugin-unused-imports';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';

export default [
  eslintJs.configs.recommended,
  nodePlugin.configs['flat/recommended'],
  eslintConfigPrettier,
  ...tsEslint.configs.recommended.map(config => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  eslintPluginUnicorn.configs.recommended,
  {
    ignores: [
      '.git/**/*', // Git files
      '.github/**/*', // GitHub files
      '.idea/**/*', // IDE files
      'coverage/**/*', // Coverage files
      'docs/**/*', // Documentation files
      'examples/**/*', // Example files
      'dist/**/*', // Distribution files
      'node_modules/**/*', // Node modules
      'coverage/**/*', // Coverage files
      '**/*.*js', // JavaScript files
    ],
  },
  {
    // Rules for all files not excluded
    languageOptions: {
      globals: {
        ...globals.mocha,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      n: nodePlugin,
      prettier: eslintPluginPrettier,
      headers: headers,
      tsdoc: tsdoc,
      'unused-imports': unusedImports,
      '@typescript-eslint': tsEslint.plugin,
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
            'eslint-plugin-unused-imports',
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
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-warning-comments': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        {
          allowExpressions: false,
          allowTypedFunctionExpressions: false,
          allowHigherOrderFunctions: false,
        },
      ],
      '@typescript-eslint/typedef': [
        'warn',
        {
          variableDeclaration: true,
          parameter: true,
          propertyDeclaration: true,
          memberVariableDeclaration: true,
        },
      ],
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
      'no-invalid-this': ['off', {}],
      '@typescript-eslint/no-unused-expressions': 'off',
      'curly': ['error', 'all'],
      'unicorn/filename-case': [
        'error',
        {
          case: 'kebabCase',
          // Optional: Ensure this rule only applies to TypeScript files
          ignore: ['.*\\.d\\.ts$'], // Ignore TypeScript declaration files if needed
        },
      ],
      'unicorn/prefer-spread': 'warn', // TODO error
      'unicorn/no-null': 'warn', // TODO error
      'unicorn/text-encoding-identifier-case': 'warn', // TODO error
      'unicorn/catch-error-name': 'warn', // TODO error
      'unicorn/no-this-assignment': 'warn', // TODO error
      'unicorn/consistent-function-scoping': 'warn', // TODO error
      'unicorn/error-message': 'warn', // TODO error
      'unicorn/import-style': 'warn', // TODO error
      'unicorn/prefer-optional-catch-binding': 'warn', // TODO error
      'unicorn/prefer-string-slice': 'warn', // TODO error
      'unicorn/no-await-expression-member': 'warn', // TODO error
      'unicorn/no-array-push-push': 'warn', // TODO error
      'unicorn/prefer-ternary': 'warn', // TODO error
      'unicorn/prefer-logical-operator-over-ternary': 'warn', // TODO error
    },
  },
  {
    // include certain rules for source ts files (everything except test files)
    ignores: ['test/**/*.ts'],
    rules: {
      'no-invalid-this': ['error', {}],
      '@typescript-eslint/no-unused-expressions': 'error',
    },
  },
];
