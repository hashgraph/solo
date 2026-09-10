#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Regenerates the dependency overrides in package.json from the current
// package-lock.json.  Run this after any change to package-lock.json
// (e.g. after a Dependabot update) to keep the supply-chain pins current.
//
// Every package in the resolved tree is pinned — production and development
// alike — so that a fresh `npm install` cannot drift from the versions the
// lock file was reviewed against.
//
// Pins are written as major-scoped keys ("glob@^7.0.0": "7.2.3") rather than
// bare names ("glob": "7.2.3").  A bare key rewrites *every* edge in the tree,
// including tooling that requires a different major, which collapses
// legitimate nested installs and breaks those packages at runtime.  A
// major-scoped key pins one major line and leaves the others to resolve
// normally, so a package used at several majors gets one entry per line.
//
// Usage:  node scripts/update-production-overrides.mjs

import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

// Splits an override key into its package name and optional version selector.
// "glob@^7.0.0" -> ["glob", "^7.0.0"];  "@scope/pkg" -> ["@scope/pkg", null]
function splitOverrideKey(key) {
  const at = key.lastIndexOf('@');
  if (at <= 0) return [key, null];
  return [key.slice(0, at), key.slice(at + 1)];
}

// The key that scopes a pin to the major line a version sits on. Versions a
// caret range cannot express (pre-releases, non-numeric) get an exact key.
function scopedKey(name, version) {
  const [major, minor] = version.split('.').map(Number);
  if (version.includes('-') || !Number.isInteger(major) || !Number.isInteger(minor)) {
    return `${name}@${version}`;
  }
  return `${name}@${major > 0 ? `^${major}.0.0` : `^0.${minor}.0`}`;
}

function compareVersions(a, b) {
  const left = a.split(/[.\-+]/);
  const right = b.split(/[.\-+]/);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const x = Number(left[index]);
    const y = Number(right[index]);
    if (Number.isInteger(x) && Number.isInteger(y)) {
      if (x !== y) return x - y;
    } else if ((left[index] ?? '') !== (right[index] ?? '')) {
      return (left[index] ?? '').localeCompare(right[index] ?? '');
    }
  }
  return 0;
}

// Every exact version already pinned by a string-valued entry, by package name.
// Nested/object entries are hand-crafted sub-tree scopes and are left alone.
const alreadyPinned = new Map();
for (const [key, value] of Object.entries(pkg.overrides ?? {})) {
  if (typeof value !== 'string') continue;
  const [name] = splitOverrideKey(key);
  const versions = alreadyPinned.get(name) ?? new Set();
  versions.add(value);
  alreadyPinned.set(name, versions);
}

// A range with a lower bound but no upper one ("&gt;=18", "*") intersects every
// major line, so npm cannot tell which of several line-scoped pins applies to
// it and may pick one that contradicts the rest of the tree — npm 10 rejects
// the install outright with ERESOLVE. Packages consumed through such a range
// therefore get a single pin, on the hoisted version, and nothing else.
function isOpenEnded(range) {
  return range
    .split('||')
    .map((part) => part.trim())
    .some((part) => part === '' || part === '*' || part === 'x' || (/^>=?[^<]*$/.test(part) && !part.includes('-')));
}

const openEndedNames = new Set();
for (const info of Object.values(lock.packages ?? {})) {
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, range] of Object.entries(info[group] ?? {})) {
      if (isOpenEnded(range)) openEndedNames.add(name);
    }
  }
}

// Collect every version of every package in the resolved tree, noting which
// one npm hoisted to the top level.
const installedVersions = new Map();
const hoistedVersion = new Map();
for (const [path, info] of Object.entries(lock.packages ?? {})) {
  if (!path.startsWith('node_modules/')) continue;
  if (info.link || !info.version) continue;
  // Aliased installs ("string-width-cjs": "npm:string-width@^4") record their
  // real package name; the override has to name the real package.
  const name = info.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const versions = installedVersions.get(name) ?? new Set();
  versions.add(info.version);
  installedVersions.set(name, versions);
  if (!path.includes('/node_modules/')) hoistedVersion.set(name, info.version);
}

// One entry per installed version. The hoisted version claims its major line's
// key ("asn1js@^3.0.0"), since that is the version the line resolves to today.
// A second version on the same line — nested because some dependent's range
// excludes the hoisted one — gets a key floored at itself ("asn1js@^3.0.10"),
// so it stays pinned too rather than drifting to whatever npm resolves next.
const generated = {};
for (const [name, versions] of installedVersions) {
  const lineOwner = new Map();
  const hoisted = hoistedVersion.get(name);
  if (hoisted !== undefined) lineOwner.set(scopedKey(name, hoisted), hoisted);
  for (const version of versions) {
    const line = scopedKey(name, version);
    const current = lineOwner.get(line);
    if (current === undefined || compareVersions(version, current) > 0) lineOwner.set(line, version);
  }
  if (hoisted !== undefined) lineOwner.set(scopedKey(name, hoisted), hoisted);
  for (const version of versions) {
    if (alreadyPinned.get(name)?.has(version)) continue; // covered by an existing entry
    if (openEndedNames.has(name) && version !== hoisted) continue; // one pin only, see isOpenEnded
    const line = scopedKey(name, version);
    generated[lineOwner.get(line) === version ? line : `${name}@^${version}`] = version;
  }
}

// Merge: generated pins fill the base; existing overrides take precedence so
// that hand-crafted entries (nested scopes, range selectors) are never
// silently replaced.
const merged = {
  ...Object.fromEntries(Object.entries(generated).sort(([a], [b]) => a.localeCompare(b))),
  ...pkg.overrides,
};

// Drop entries left behind by an earlier resolution: the package is still in
// the tree but no longer at the pinned version, so the entry can never match.
// A pin for a package that is absent entirely is left alone — it is a guard
// against that package reappearing, not residue.
for (const [key, value] of Object.entries(merged)) {
  if (typeof value !== 'string') continue;
  const [name] = splitOverrideKey(key);
  const versions = installedVersions.get(name);
  if (versions !== undefined && !versions.has(value)) delete merged[key];
}

const before = JSON.stringify(pkg.overrides);
pkg.overrides = merged;
const after = JSON.stringify(merged);

writeFileSync(resolve(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

if (before === after) {
  console.log('Dependency overrides are already up to date.');
} else {
  console.log(`Dependency overrides updated (${Object.keys(merged).length} entries).`);
}
