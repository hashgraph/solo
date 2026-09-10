// SPDX-License-Identifier: Apache-2.0

import {basename} from 'node:path';
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

// Local rules enforcing Solo conventions that no off-the-shelf plugin covers.
// See docs/contributing/typescript-code-style.md §3.4.5 and §10.3.1.
const soloLocalPlugin = {
  rules: {
    // Behavior (resolvers, orchestrators, computations) must be grouped on a class as static
    // methods rather than exported as free functions. Pure data (constants, types, simple
    // factories) may still be exported — this rule only targets functions.
    'no-exported-function': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow exported functions — group behavior on a class with static methods (§10.3.1).',
        },
        schema: [],
        messages: {
          noExportedFunction:
            'No exported functions — group behavior on a class with static methods. ' +
            'See docs/contributing/typescript-code-style.md §10.3.1. ' +
            'Pure data (constants, types) may be exported; helpers used by one class become private static members.',
        },
      },
      create(context) {
        return {
          'ExportNamedDeclaration > FunctionDeclaration'(node) {
            context.report({node, messageId: 'noExportedFunction'});
          },
          'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator'(node) {
            const initializerType = node.init?.type;
            if (initializerType === 'ArrowFunctionExpression' || initializerType === 'FunctionExpression') {
              context.report({node, messageId: 'noExportedFunction'});
            }
          },
        };
      },
    },

    // Every direct node:child_process invocation must state its `shell` option explicitly, so the
    // call site documents that no shell interprets its arguments; exec/execSync always run a shell
    // and are banned outright. PR #4804 swept the implicit-shell call sites once already and they
    // drifted back (#5869) — this rule keeps them out.
    'require-explicit-shell': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Require an explicit `shell` option on child_process calls and ban exec/execSync.',
        },
        schema: [],
        messages: {
          missingShell:
            'Pass an explicit `shell` option (normally `shell: false`) to child_process.{{name}} ' +
            'so the call site documents that no shell interprets its arguments.',
          shellOnly: 'child_process.{{name}} always runs a shell — use execFile/spawn with an argument array instead.',
        },
      },
      create(context) {
        const spawnLikeNames = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync']);
        const shellOnlyNames = new Set(['exec', 'execSync']);
        const namedImportLocals = new Map(); // local identifier name -> imported child_process member name
        const moduleObjectLocals = new Set(); // locals bound to the whole module (namespace/default import)

        function hasExplicitShellOption(callArguments) {
          return callArguments.some(
            argument =>
              argument.type === 'ObjectExpression' &&
              argument.properties.some(
                property =>
                  property.type === 'Property' &&
                  !property.computed &&
                  (property.key.name === 'shell' || property.key.value === 'shell'),
              ),
          );
        }

        function childProcessMemberName(callee) {
          if (callee.type === 'Identifier') {
            return namedImportLocals.get(callee.name);
          }
          if (
            callee.type === 'MemberExpression' &&
            !callee.computed &&
            callee.object.type === 'Identifier' &&
            moduleObjectLocals.has(callee.object.name)
          ) {
            return callee.property.name;
          }
          return undefined;
        }

        return {
          ImportDeclaration(node) {
            if (node.source.value !== 'node:child_process' && node.source.value !== 'child_process') {
              return;
            }
            for (const specifier of node.specifiers) {
              if (specifier.type === 'ImportSpecifier') {
                namedImportLocals.set(specifier.local.name, specifier.imported.name);
              } else {
                moduleObjectLocals.add(specifier.local.name);
              }
            }
          },
          CallExpression(node) {
            const name = childProcessMemberName(node.callee);
            if (name === undefined) {
              return;
            }
            if (shellOnlyNames.has(name)) {
              context.report({node, messageId: 'shellOnly', data: {name}});
              return;
            }
            if (spawnLikeNames.has(name) && !hasExplicitShellOption(node.arguments)) {
              context.report({node, messageId: 'missingShell', data: {name}});
            }
          },
        };
      },
    },

    // Each exported interface must be in its own file named in kebab-case matching the
    // interface name — §3.5. No off-the-shelf rule covers name-matching; unicorn/filename-case
    // enforces kebab-case style but not that the filename matches the interface name.
    'exported-interface-in-own-file': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Each exported interface must be in its own file named in kebab-case matching the interface name (§3.5).',
        },
        schema: [],
        messages: {
          filenameMismatch:
            'Exported interface "{{interfaceName}}" must be in its own file named ' +
            '"{{expectedFilename}}.ts" — move it or rename the file (§3.5).',
        },
      },
      create(context) {
        function toKebabCase(name) {
          return name
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
            .replace(/([a-z\d])([A-Z])/g, '$1-$2')
            .toLowerCase();
        }

        return {
          'ExportNamedDeclaration > TSInterfaceDeclaration'(node) {
            const filename = context.filename;
            if (!filename || filename.endsWith('.d.ts')) return;

            const interfaceName = node.id.name;
            const expectedFilename = toKebabCase(interfaceName);
            const actualFilename = basename(filename, '.ts');

            if (actualFilename !== expectedFilename) {
              context.report({
                node: node.id,
                messageId: 'filenameMismatch',
                data: {interfaceName, expectedFilename},
              });
            }
          },
        };
      },
    },
  },
};

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
      '!.github/**/*.ts', // ...except TypeScript files
      '.idea/**/*', // IDE files
      '.claude/**/*', // Claude AI files
      'coverage/**/*', // Coverage files
      'docs/**/*', // Documentation files
      'examples/**/*', // Example files
      'dist/**/*', // Distribution files
      'scripts/metrics-plotter/**/*', // External tool files
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
          additionalExecutables: ['solo.ts', '.github/workflows/script/jdwp-tester.ts'],
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
      '@typescript-eslint/no-explicit-any': 'warn', // TODO remove (406 errors)
      '@typescript-eslint/no-this-alias': [
        'error',
        {
          allowedNames: ['self'], // TODO remove (59 errors)
        },
      ],
      '@typescript-eslint/no-unused-vars': 'warn', // TODO remove (6 errors)
      'n/no-process-exit': 'warn', // TODO remove (1 errors)
      // Enforce `import {type X} from 'path';` over `import type {X} from 'path';`,
      // but allow `import type * as <name> from 'path';`
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportDeclaration[importKind='type'] ImportSpecifier",
          message: "Use `import {type X} from 'path';` instead of `import type {X} from 'path';`.",
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': 'warn', // TODO remove (47 error)
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'no-invalid-this': ['off', {}],
      '@typescript-eslint/no-unused-expressions': 'off',
      curly: ['error', 'all'],
      '@typescript-eslint/no-extraneous-class': [
        'error',
        {
          allowWithDecorator: true,
          allowStaticOnly: true,
          allowConstructorOnly: true,
        },
      ],
      'unicorn/filename-case': [
        'error',
        {
          case: 'kebabCase',
          // Optional: Ensure this rule only applies to TypeScript files
          ignore: ['.*\\.d\\.ts$'], // Ignore TypeScript declaration files if needed
        },
      ],
      'unicorn/no-null': 'warn', // TODO error (104 errors)
      'unicorn/consistent-function-scoping': 'warn', // TODO error (2 errors)
      'unicorn/error-message': 'warn', // TODO error (1 error)
      'unicorn/import-style': 'warn', // TODO error (8 errors)
      'unicorn/better-dom-traversing': 'off', // TODO seems to be misidentifying some of our custom classes as Arrays
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
  {
    // No exported functions in source code — see §10.3.1.
    // One exported interface per file, filename matches interface name in kebab-case — see §3.5.
    // Explicit `shell` option on every child_process call — see #5869.
    files: ['src/**/*.ts'],
    plugins: {solo: soloLocalPlugin},
    rules: {
      'solo/no-exported-function': 'error',
      'solo/exported-interface-in-own-file': 'error',
      'solo/require-explicit-shell': 'error',
    },
  },
  {
    // Enforce getEnvironmentVariable() over process.env[...] bracket notation in src/.
    // Bracket-notation reads bypass the utility and the env.md documentation requirement.
    // See CLAUDE.md "Environment Variable Access".
    // constants.ts is excluded because it defines getEnvironmentVariable() and legitimately
    // accesses process.env[name] internally.
    files: ['src/**/*.ts'],
    ignores: ['src/core/constants.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // Re-state the global import-type check here because this block overrides
        // no-restricted-syntax for src/ files; @typescript-eslint/consistent-type-imports
        // already enforces the same thing at error level, so this is belt-and-suspenders.
        {
          selector: "ImportDeclaration[importKind='type'] ImportSpecifier",
          message: "Use `import {type X} from 'path';` instead of `import type {X} from 'path';`.",
        },
        {
          selector:
            'MemberExpression[computed=true][object.type="MemberExpression"][object.object.name="process"][object.property.name="env"]',
          message:
            'Use getEnvironmentVariable() from src/core/constants.ts instead of process.env[...]. ' +
            'Bracket-notation access bypasses the project utility and the env.md documentation requirement (see CLAUDE.md).',
        },
      ],
    },
  },
  {
    // @kubernetes/client-node types must not leak outside src/integration/kube.
    // Use Solo domain types (Pod, ContainerStatus, etc.) in all other layers.
    files: ['**/*.ts'],
    ignores: ['src/integration/kube/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          name: '@kubernetes/client-node',
          message:
            '@kubernetes/client-node types must stay within src/integration/kube — use the Solo domain types (Pod, ContainerStatus, etc.) instead.',
        },
      ],
    },
  },
];
