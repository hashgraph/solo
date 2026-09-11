// SPDX-License-Identifier: Apache-2.0

/**
 * Builds the Solo Node.js Single Executable Application (SEA) for the current platform.
 *
 * Pipeline:
 *   1. esbuild bundles dist/src/index.js (exports main(), no top-level await) into a CJS file
 *   2. A generated CJS SEA entry (sea-main.cjs) bootstraps synchronously, then dynamically
 *      imports the bundle
 *   3. All files under resources/, persist-port-forward.js, and solo-src-bundle.cjs are SEA assets
 *   4. node --experimental-sea-config generates the SEA blob from sea-main.cjs
 *   5. The current node binary is copied and the blob is injected via postject's programmatic
 *      API (not its CLI — `npx postject` resolves to npx.cmd on Windows, which execFileSync
 *      cannot launch without a shell)
 *   6. On macOS the binary is re-signed with an ad-hoc signature
 *
 * Why dist/src/index.js (not dist/solo.js)?
 *   dist/solo.js is compiled from solo.ts which uses top-level await, incompatible with esbuild's
 *   CJS output format. dist/src/index.js exports async function main() with no top-level await.
 *   The source-map-support import is also in solo.ts (not src/index.ts), so the CJS bundle avoids
 *   the dynamic-require issue that crashes esbuild's ESM-format shim (__require2).
 *
 * How bootstrapping works:
 *   sea-main.cjs (the SEA main script, embedded in the blob) runs synchronously:
 *     1. Sets SOLO_SEA_VERSION and SOLO_SEA_ROOT_DIR env vars
 *     2. Extracts all SEA assets (including solo-src-bundle.cjs) to ~/.solo/sea-resources/<ver>/
 *     3. Calls import(seaRoot/solo-src-bundle.cjs) — Node's SEA require() override only allows
 *        built-in modules, so the bootstrap uses the async module loader instead
 *     4. Delegates to the bundle's exported CliBootstrap.run() (shared with solo.ts) to invoke
 *        main() and handle errors/exit
 *   constants.ts reads SOLO_SEA_ROOT_DIR (set before require()) for ROOT_DIR.
 *   version.ts reads SOLO_SEA_VERSION (set before require()) for getSoloVersion().
 *
 * Output: sea/dist/solo-<platform>-<arch>[.exe]
 *
 * Run with: npx tsx sea/build.ts
 * Or via:   task sea:build   (which ensures build:compile ran first)
 */

import * as esbuild from 'esbuild';
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
// postject ships no type declarations; tsconfig.json has "strict": false, so this resolves to `any`.
import {inject as postjectInject} from 'postject';

const SEA_DIR: string = path.dirname(fileURLToPath(import.meta.url));
const ROOT: string = path.join(SEA_DIR, '..');
const BUILD_DIR: string = path.join(SEA_DIR, 'dist');
const RESOURCES_DIR: string = path.join(ROOT, 'resources');
const DIST_DIR: string = path.join(ROOT, 'dist');
const SEA_MAIN_TEMPLATE_PATH: string = path.join(SEA_DIR, 'sea-main.template.cjs');

const packageJson: {version: string} = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version: string = packageJson.version;

const {platform, arch} = process;
const extension: string = platform === 'win32' ? '.exe' : '';
const binaryName: string = `solo-${platform}-${arch}${extension}`;

const bundlePath: string = path.join(BUILD_DIR, 'solo-src-bundle.cjs');
const seaMainPath: string = path.join(BUILD_DIR, 'sea-main.cjs');
const blobPath: string = path.join(BUILD_DIR, 'sea-prep.blob');
const configPath: string = path.join(BUILD_DIR, 'sea-config.json');
const binaryPath: string = path.join(BUILD_DIR, binaryName);

function run(command: string, commandArguments: string[], label: string): void {
  console.log(`\n▶ ${label}`);
  execFileSync(command, commandArguments, {stdio: 'inherit'});
}

/** Recursively collect all files under a directory, returning paths relative to a base directory. */
function collectFiles(directory: string, baseDirectory: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(directory)) {
    const fullPath: string = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...collectFiles(fullPath, baseDirectory));
    } else {
      results.push(path.relative(baseDirectory, fullPath));
    }
  }
  return results;
}

// SEA requires a Node.js build with the feature compiled in. Homebrew's `node` formula (and
// other --shared builds) has it disabled, so `node --experimental-sea-config` hard-fails there.
// Skip with a warning instead of failing the whole build on such a Node
const seaSupported: boolean =
  (process.config.variables as {single_executable_application?: boolean}).single_executable_application === true;
if (!seaSupported) {
  console.warn(
    '\n⚠ Skipping SEA build: this Node.js build has the single-executable-application feature ' +
      "disabled. Use an official Node.js build (nodejs.org, nvm, 'fnm) to produce a binary.\n',",
  );
  // eslint-disable-next-line unicorn/no-process-exit, n/no-process-exit
  process.exit(0);
}

console.log(`\nBuilding Solo SEA binary v${version} for ${platform}/${arch}: ${binaryName}`);

mkdirSync(BUILD_DIR, {recursive: true});

// Step 1: bundle the solo module into a self-contained CJS file.
// Entry: dist/src/index.js (exports main(), zero top-level await).
// CJS format: Node.js built-in require() works for transitive CJS packages at runtime.
// import.meta in constants.ts / version.ts is never evaluated because SOLO_SEA_ROOT_DIR /
// SOLO_SEA_VERSION are set by sea-main.cjs before this bundle is require()d.
console.log('\n▶ Bundling dist/src/index.js with esbuild (CJS)');
await esbuild.build({
  entryPoints: [path.join(DIST_DIR, 'src', 'index.js')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: bundlePath,
  external: ['*.node'],
  keepNames: true,
  // In CJS format, esbuild replaces import.meta with {}. Some ESM packages call
  // Module.createRequire(import.meta.url) at module level — with import.meta.url === undefined
  // that throws ERR_INVALID_ARG_VALUE at runtime. Providing the bundle's own file URL keeps
  // those createRequire() calls valid on all platforms (pathToFileURL produces a correct
  // file:///C:/... URL on Windows, file:///... on Unix).
  define: {'import.meta.url': JSON.stringify(pathToFileURL(bundlePath).href)},
  logOverride: {'empty-import-meta': 'silent'},
  logLevel: 'warning',
});

// Step 2: build the SEA assets map after the bundle exists.
const seaAssets: Record<string, string> = {};

// Resource files: preserve repo-relative path so the bootstrap reconstructs the same
// directory structure under ~/.solo/sea-resources/<version>/.
for (const relativePath of collectFiles(RESOURCES_DIR, ROOT)) {
  seaAssets[relativePath] = path.join(ROOT, relativePath);
}

// persist-port-forward.js is spawned as a detached child process. k8-client-pod.ts
// uses SOLO_SEA_ROOT_DIR to locate it in SEA mode.
seaAssets['scripts/persist-port-forward.js'] = path.join(
  DIST_DIR,
  'src',
  'integration',
  'kube',
  'k8-client',
  'resources',
  'pod',
  'persist-port-forward.js',
);

// package.json — embedded so getSoloVersion() can fall back to it if needed.
seaAssets['package.json'] = path.join(ROOT, 'package.json');

// The bundled solo code: extracted at first run and then required synchronously.
seaAssets['solo-src-bundle.cjs'] = bundlePath;

const assetKeys: string[] = Object.keys(seaAssets);
const buildId: string = `${version}-${Date.now()}`;

// Step 3: generate the CJS SEA entry script from sea-main.template.cjs.
// sea-main.cjs is what Node.js executes from the SEA blob. It:
//   - Bootstraps synchronously (sets env vars, extracts assets)
//   - Dynamically imports solo-src-bundle.cjs from the extracted seaRoot
//   - Delegates to the bundle's exported CliBootstrap.run() to invoke main() and handle errors/exit
// Note: Node.js SEA overrides require() to allow only built-in modules (embedderRequire).
// Any non-built-in path passed to require() throws ERR_UNKNOWN_BUILTIN_MODULE.
// Dynamic import() goes through the regular module loader and CAN load filesystem files,
// so we use import() + pathToFileURL to load solo-src-bundle.cjs after extraction.
//
// The bootstrap logic lives in the template file (a real, lintable .cjs file) rather than
// an inline template literal here. Build-time values are injected via a plain string
// substitution of the template's three placeholder tokens — no templating library needed.
const seaMainTemplate: string = readFileSync(SEA_MAIN_TEMPLATE_PATH, 'utf8');
const seaMainContent: string = seaMainTemplate
  .replace("'__SOLO_SEA_VERSION__'", JSON.stringify(version))
  .replace("'__SOLO_SEA_BUILD_ID__'", JSON.stringify(buildId))
  .replace("['__SOLO_SEA_ASSET_KEYS__']", JSON.stringify(assetKeys));
writeFileSync(seaMainPath, seaMainContent);

// Step 4: write sea-config.json and generate the SEA blob from sea-main.cjs.
const seaConfig: Record<string, unknown> = {
  main: seaMainPath,
  output: blobPath,
  assets: seaAssets,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
};
writeFileSync(configPath, JSON.stringify(seaConfig, undefined, 2));

run('node', ['--experimental-sea-config', configPath], 'Generating SEA blob');

copyFileSync(process.execPath, binaryPath);
console.log(`\n▶ Copied node binary → ${binaryName}`);

if (platform === 'darwin') {
  run('codesign', ['--remove-signature', binaryPath], 'Removing existing macOS signature');
}

// The sentinel fuse is the fixed marker string Node.js embeds in its own binary at build time
// (see NODE_SEA_FUSE in Node's deps/v8 fuse.h). postject searches the copied node binary for
// this exact byte sequence and flips a bit next to it once the blob is injected — that bit is
// what makes sea.isSea() (node:sea) and Node's SEA bootstrap return true at runtime. The value
// is Node's own constant, not something generated per build, so it must not change.
await postjectInject(binaryPath, 'NODE_SEA_BLOB', readFileSync(blobPath), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ...(platform === 'darwin' ? {machoSegmentName: 'NODE_SEA'} : {}),
});

if (platform === 'darwin') {
  run('codesign', ['--sign', '-', binaryPath], 'Re-signing for macOS (ad-hoc)');
}

console.log(`\n✓ Solo SEA binary ready: sea/dist/${binaryName}\n`);
