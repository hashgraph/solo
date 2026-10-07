// SPDX-License-Identifier: Apache-2.0
'use strict';
// SEA bootstrap — synchronous CJS; sets env vars and extracts assets before loading solo.
// NOTE: require() in SEA mode is restricted to Node.js built-ins; use import() for files.
//
// This file is a template, not run directly: sea/build.ts reads it and replaces the three
// placeholder tokens below (SOLO_SEA_VERSION, SOLO_SEA_BUILD_ID, SOLO_SEA_ASSET_KEYS) with
// build-time values via a plain string substitution, then writes the result to
// sea/dist/sea-main.cjs, which is what Node.js actually executes from the SEA blob. Keeping
// this logic in its own .cjs file (instead of a template literal inside build.ts) gives it
// normal editor syntax highlighting and IDE navigation. It is NOT linted: eslint.config.mjs
// globally ignores '**/*.*js', so `task check` never runs eslint over this file.
const sea = require('node:sea');
const os = require('os');
const path = require('path');
const fs = require('fs');
const url = require('url');

const SOLO_SEA_VERSION = '__SOLO_SEA_VERSION__';
// Build id includes a timestamp so a rebuild with the same version (e.g. a CI artifact
// from another commit) still re-extracts instead of reusing stale cached assets.
const SOLO_SEA_BUILD_ID = '__SOLO_SEA_BUILD_ID__';
const SOLO_SEA_ASSET_KEYS = ['__SOLO_SEA_ASSET_KEYS__'];

let bundleFileUrl;
if (sea.isSea()) {
  process.env['SOLO_SEA_VERSION'] = SOLO_SEA_VERSION;

  const seaRoot = path.join(os.homedir(), '.solo', 'sea-resources', SOLO_SEA_VERSION);
  process.env['SOLO_SEA_ROOT_DIR'] = seaRoot;

  // Skip extraction when the marker already records this exact build.
  const markerPath = path.join(seaRoot, '.sea-extracted');
  let needsExtraction = true;
  try {
    needsExtraction = fs.readFileSync(markerPath, 'utf8').trim() !== SOLO_SEA_BUILD_ID;
  } catch {
    /* not yet extracted */
  }

  if (needsExtraction) {
    for (const key of SOLO_SEA_ASSET_KEYS) {
      const data = sea.getAsset(key);
      const destPath = path.join(seaRoot, key);
      fs.mkdirSync(path.dirname(destPath), {recursive: true});
      fs.writeFileSync(destPath, Buffer.from(data));
    }
    fs.writeFileSync(markerPath, SOLO_SEA_BUILD_ID);
  }

  bundleFileUrl = url.pathToFileURL(path.join(seaRoot, 'solo-src-bundle.cjs')).href;
} else {
  // Not running as SEA (e.g. development test of the built artefacts).
  bundleFileUrl = url.pathToFileURL(path.join(__dirname, 'solo-src-bundle.cjs')).href;
}

// import() uses the regular module loader and can access the filesystem — unlike require()
// in SEA mode which is restricted to built-ins. Importing a .cjs file returns its
// module.exports as the default export.
import(bundleFileUrl)
  .then(function (mod) {
    const soloModule = mod.default || mod;
    return soloModule.CliBootstrap.run(process.argv, soloModule.main);
  })
  .catch(function (error) {
    process.exitCode = 1;
    console.error(error);
  });
