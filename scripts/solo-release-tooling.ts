// SPDX-License-Identifier: Apache-2.0

import {readFileSync} from 'node:fs';
import {spawnSync, type SpawnSyncReturns} from 'node:child_process';

export interface ParsedConventionalCommit {
  type: string;
  scope: string | undefined;
  isBreaking: boolean;
  description: string;
}

export interface CommitHistoryAnalysis {
  isTckOnly: boolean;
  tckCount: number;
  soloFeatureCount: number;
  soloBreakingCount: number;
  soloFixCount: number;
  soloOtherCount: number;
  totalSoloCommits: number;
  currentVersion: string;
  nextVersion: string;
  bumpType: 'none' | 'minor' | 'patch';
  shouldPrepareRelease: boolean;
  reason: string;
}

export interface ParsedSemanticVersion {
  major: number;
  minor: number;
  patch: number;
  preRelease: string | undefined;
}

export class SoloReleaseTooling {
  private static readonly SOLO_TAG_REGEX: RegExp =
    /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

  private static readonly CONVENTIONAL_COMMIT_REGEX: RegExp = /^([a-zA-Z0-9_.-]+)(?:\(([^)]+)\))?(!)?:\s*(.*)$/;

  /**
   * Parses a Semantic Version string with optional leading 'v'.
   */
  public static parseSemanticVersion(versionString: string): ParsedSemanticVersion | undefined {
    if (typeof versionString !== 'string') {
      return undefined;
    }

    const trimmed: string = versionString.trim();
    const match: RegExpMatchArray | null = trimmed.match(
      /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([^+]+))?(?:\+.*)?$/,
    );
    if (!match) {
      return undefined;
    }

    return {
      major: Number.parseInt(match[1], 10),
      minor: Number.parseInt(match[2], 10),
      patch: Number.parseInt(match[3], 10),
      preRelease: match[4] ?? undefined,
    };
  }

  /**
   * Compares two Semantic Version strings according to SemVer 2.0.0 precedence.
   * Returns positive if versionA > versionB, negative if versionA < versionB, 0 if equal.
   */
  public static compareSemanticVersion(versionA: string, versionB: string): number {
    const parsedA: ParsedSemanticVersion | undefined = SoloReleaseTooling.parseSemanticVersion(versionA);
    const parsedB: ParsedSemanticVersion | undefined = SoloReleaseTooling.parseSemanticVersion(versionB);

    if (!parsedA && !parsedB) {
      return 0;
    }
    if (!parsedA) {
      return -1;
    }
    if (!parsedB) {
      return 1;
    }

    if (parsedA.major !== parsedB.major) {
      return parsedA.major - parsedB.major;
    }
    if (parsedA.minor !== parsedB.minor) {
      return parsedA.minor - parsedB.minor;
    }
    if (parsedA.patch !== parsedB.patch) {
      return parsedA.patch - parsedB.patch;
    }

    // Normal version has higher precedence than a pre-release version
    if (!parsedA.preRelease && parsedB.preRelease) {
      return 1;
    }
    if (parsedA.preRelease && !parsedB.preRelease) {
      return -1;
    }
    if (!parsedA.preRelease && !parsedB.preRelease) {
      return 0;
    }

    const identifiersA: string[] = (parsedA.preRelease ?? '').split('.');
    const identifiersB: string[] = (parsedB.preRelease ?? '').split('.');
    const maxLength: number = Math.max(identifiersA.length, identifiersB.length);

    for (let index: number = 0; index < maxLength; index += 1) {
      const partA: string | undefined = identifiersA[index];
      const partB: string | undefined = identifiersB[index];

      if (partA === undefined) {
        return -1;
      }
      if (partB === undefined) {
        return 1;
      }

      const numberA: number = Number(partA);
      const numberB: number = Number(partB);
      const isNumericA: boolean = !Number.isNaN(numberA);
      const isNumericB: boolean = !Number.isNaN(numberB);

      if (isNumericA && isNumericB) {
        if (numberA !== numberB) {
          return numberA - numberB;
        }
      } else if (isNumericA) {
        return -1; // Numeric identifiers have lower precedence than non-numeric
      } else if (isNumericB) {
        return 1;
      } else if (partA !== partB) {
        return partA.localeCompare(partB);
      }
    }

    return 0;
  }

  /**
   * Checks whether a Git tag corresponds to a valid Solo release tag.
   *
   * Solo release tags:
   * - Must match the Solo release naming convention: v<major>.<minor>.<patch>[-prerelease][+build]
   * - Must not contain "tck" (case-insensitive) anywhere in the tag
   * - Must be valid SemVer
   */
  public static isValidSoloReleaseTag(tag: string | null | undefined): boolean {
    if (typeof tag !== 'string') {
      return false;
    }

    const trimmedTag: string = tag.trim();
    if (!trimmedTag.startsWith('v')) {
      return false;
    }

    if (/tck/i.test(trimmedTag)) {
      return false;
    }

    if (!SoloReleaseTooling.SOLO_TAG_REGEX.test(trimmedTag)) {
      return false;
    }

    return SoloReleaseTooling.parseSemanticVersion(trimmedTag) !== undefined;
  }

  /**
   * Filters an array of tags, keeping only valid Solo release tags.
   */
  public static filterValidSoloReleaseTags(tags: string[]): string[] {
    if (!Array.isArray(tags)) {
      return [];
    }

    return tags.filter((tag: string): boolean => SoloReleaseTooling.isValidSoloReleaseTag(tag));
  }

  /**
   * Sorts tags using Semantic Versioning order in descending order (highest version first).
   */
  public static sortTagsDescending(tags: string[]): string[] {
    const validTags: string[] = SoloReleaseTooling.filterValidSoloReleaseTags(tags);
    // eslint-disable-next-line unicorn/no-array-sort -- toSorted() requires ES2023, repo targets ES2022
    return [...validTags].sort((firstTag: string, secondTag: string): number => {
      return SoloReleaseTooling.compareSemanticVersion(secondTag, firstTag);
    });
  }

  /**
   * Selects the latest valid Solo release tag from a collection of tags.
   * Returns undefined if no valid Solo release tag exists.
   */
  public static selectLatestSoloReleaseTag(tags: string[]): string | undefined {
    const sortedTags: string[] = SoloReleaseTooling.sortTagsDescending(tags);
    return sortedTags.length > 0 ? sortedTags[0] : undefined;
  }

  /**
   * Queries Git for all tags reachable from HEAD in the specified working directory,
   * filters for valid Solo release tags, and returns them in descending SemVer order.
   */
  public static getReachableSoloReleaseTags(workingDirectory?: string): string[] {
    try {
      const result: SpawnSyncReturns<string> = spawnSync('git', ['tag', '--list', 'v[0-9]*', '--merged', 'HEAD'], {
        cwd: workingDirectory ?? process.cwd(),
        encoding: 'utf8',
        shell: false,
      });

      if (result.status !== 0 || !result.stdout) {
        return [];
      }

      const tags: string[] = result.stdout
        .split('\n')
        .map((line: string): string => line.trim())
        .filter((line: string): boolean => line.length > 0);

      return SoloReleaseTooling.sortTagsDescending(tags);
    } catch {
      // best-effort: return empty array when git execution fails (e.g. not a git repo)
      return [];
    }
  }

  /**
   * Returns the latest valid Solo release tag reachable from HEAD.
   */
  public static getLatestSoloReleaseTag(workingDirectory?: string): string | undefined {
    const sortedTags: string[] = SoloReleaseTooling.getReachableSoloReleaseTags(workingDirectory);
    return sortedTags.length > 0 ? sortedTags[0] : undefined;
  }

  /**
   * Parses a commit subject line into Conventional Commit components.
   */
  public static parseCommitSubject(subject: string): ParsedConventionalCommit | undefined {
    if (typeof subject !== 'string') {
      return undefined;
    }

    const trimmedSubject: string = subject.trim();
    const firstLine: string = trimmedSubject.split(/\r?\n/, 1)[0].trim();
    const match: RegExpMatchArray | null = firstLine.match(SoloReleaseTooling.CONVENTIONAL_COMMIT_REGEX);
    if (!match) {
      return undefined;
    }

    const isBreaking: boolean = Boolean(match[3]) || /BREAKING[- ]CHANGE:/i.test(trimmedSubject);

    return {
      type: match[1].toLowerCase(),
      scope: match[2]?.trim().toLowerCase(),
      isBreaking,
      description: match[4].trim(),
    };
  }

  /**
   * Returns true if a commit has the exact scope "tck".
   */
  public static isTckCommit(subject: string): boolean {
    const parsed: ParsedConventionalCommit | undefined = SoloReleaseTooling.parseCommitSubject(subject);
    return parsed?.scope === 'tck';
  }

  /**
   * Returns true if a commit is a Solo feature commit (type "feat" with scope other than "tck").
   */
  public static isSoloFeatureCommit(subject: string): boolean {
    const parsed: ParsedConventionalCommit | undefined = SoloReleaseTooling.parseCommitSubject(subject);
    if (!parsed) {
      return false;
    }

    return parsed.type === 'feat' && parsed.scope !== 'tck';
  }

  /**
   * Queries Git for commit subjects since a given tag up to HEAD.
   */
  public static getCommitsSinceTag(tag: string | undefined, workingDirectory?: string): string[] {
    try {
      const gitArguments: string[] = tag ? ['log', `${tag}..HEAD`, '--pretty=%s'] : ['log', 'HEAD', '--pretty=%s'];

      const result: SpawnSyncReturns<string> = spawnSync('git', gitArguments, {
        cwd: workingDirectory ?? process.cwd(),
        encoding: 'utf8',
        shell: false,
      });

      if (result.status !== 0 || !result.stdout) {
        return [];
      }

      return result.stdout
        .split('\n')
        .map((line: string): string => line.trim())
        .filter((line: string): boolean => line.length > 0);
    } catch {
      // best-effort: return empty array when git execution fails
      return [];
    }
  }

  /**
   * Reads the current version from package.json in the repository.
   */
  public static getPackageVersion(packageJsonPath: string = 'package.json'): string {
    const content: string = readFileSync(packageJsonPath, 'utf8');
    const parsed: {version?: string} = JSON.parse(content) as {version?: string};
    return parsed.version ?? '0.0.0';
  }

  /**
   * Analyzes commit subjects since the last tag and determines release decision.
   */
  public static analyzeCommitHistory(commitSubjects: string[], currentVersion: string): CommitHistoryAnalysis {
    const cleanCurrentVersion: string = currentVersion.replace(/^v/, '').trim();
    const versionParts: string[] = cleanCurrentVersion.split('.');
    const major: number = Number.parseInt(versionParts[0] ?? '0', 10);
    const minor: number = Number.parseInt(versionParts[1] ?? '0', 10);
    const patch: number = Number.parseInt(versionParts[2] ?? '0', 10);

    let tckCount: number = 0;
    let soloFeatureCount: number = 0;
    let soloBreakingCount: number = 0;
    let soloFixCount: number = 0;
    let soloOtherCount: number = 0;

    for (const rawSubject of commitSubjects) {
      const subject: string = rawSubject.trim();
      if (!subject) {
        continue;
      }

      const parsed: ParsedConventionalCommit | undefined = SoloReleaseTooling.parseCommitSubject(subject);
      if (parsed?.scope === 'tck') {
        tckCount += 1;
      } else {
        if (parsed?.isBreaking) {
          soloBreakingCount += 1;
        }
        if (parsed?.type === 'feat') {
          soloFeatureCount += 1;
        } else if (parsed?.type === 'fix') {
          soloFixCount += 1;
        } else {
          soloOtherCount += 1;
        }
      }
    }

    const totalSoloCommits: number = soloFeatureCount + soloFixCount + soloOtherCount;
    const isTckOnly: boolean = commitSubjects.length > 0 && totalSoloCommits === 0;

    if (commitSubjects.length === 0) {
      return {
        isTckOnly: false,
        tckCount: 0,
        soloFeatureCount: 0,
        soloBreakingCount: 0,
        soloFixCount: 0,
        soloOtherCount: 0,
        totalSoloCommits: 0,
        currentVersion: cleanCurrentVersion,
        nextVersion: cleanCurrentVersion,
        bumpType: 'none',
        shouldPrepareRelease: false,
        reason: 'No commits since last release tag.',
      };
    }

    if (isTckOnly) {
      return {
        isTckOnly: true,
        tckCount,
        soloFeatureCount: 0,
        soloBreakingCount: 0,
        soloFixCount: 0,
        soloOtherCount: 0,
        totalSoloCommits: 0,
        currentVersion: cleanCurrentVersion,
        nextVersion: cleanCurrentVersion,
        bumpType: 'none',
        shouldPrepareRelease: false,
        reason: `Commit history contains only ${tckCount} TCK commit(s). No Solo release is needed.`,
      };
    }

    if (soloFeatureCount > 0 || soloBreakingCount > 0) {
      const nextMinorVersion: string = `${major}.${minor + 1}.0`;
      const reason: string =
        soloFeatureCount > 0
          ? `Found ${soloFeatureCount} Solo feature(s) (excluding ${tckCount} TCK commit(s)). Minor bump required.`
          : `Found ${soloBreakingCount} Solo breaking change(s) (excluding ${tckCount} TCK commit(s)). Minor bump required.`;

      return {
        isTckOnly: false,
        tckCount,
        soloFeatureCount,
        soloBreakingCount,
        soloFixCount,
        soloOtherCount,
        totalSoloCommits,
        currentVersion: cleanCurrentVersion,
        nextVersion: nextMinorVersion,
        bumpType: 'minor',
        shouldPrepareRelease: true,
        reason,
      };
    }

    const nextPatchVersion: string = `${major}.${minor}.${patch + 1}`;
    return {
      isTckOnly: false,
      tckCount,
      soloFeatureCount: 0,
      soloBreakingCount: 0,
      soloFixCount,
      soloOtherCount,
      totalSoloCommits,
      currentVersion: cleanCurrentVersion,
      nextVersion: nextPatchVersion,
      bumpType: 'patch',
      shouldPrepareRelease: false,
      reason: `No Solo features found (${soloFixCount} fix(es), ${soloOtherCount} other(s), ${tckCount} TCK commit(s)). Patch-only bump, no release documentation required.`,
    };
  }

  /**
   * CLI entry point for release preparation workflows.
   */
  public static main(argumentsList: string[]): void {
    const action: string = argumentsList[0] ?? 'check-release';

    if (action === 'get-last-tag') {
      const lastTag: string | undefined = SoloReleaseTooling.getLatestSoloReleaseTag();
      if (!lastTag) {
        console.error('No valid Solo release tag found.');
        process.exitCode = 1;
        return;
      }
      console.log(lastTag);
      return;
    }

    const currentVersion: string = SoloReleaseTooling.getPackageVersion();
    const lastTag: string | undefined = SoloReleaseTooling.getLatestSoloReleaseTag();
    const commits: string[] = SoloReleaseTooling.getCommitsSinceTag(lastTag);
    const analysis: CommitHistoryAnalysis = SoloReleaseTooling.analyzeCommitHistory(commits, currentVersion);

    if (action === 'next-version') {
      if (analysis.isTckOnly) {
        console.error(`TCK-only changes detected (${analysis.tckCount} commit(s)). No Solo release.`);
        process.exitCode = 1;
        return;
      }
      console.log(analysis.nextVersion);
      return;
    }

    if (action === 'check-release' || action === 'analyze') {
      console.log(`Current version: ${analysis.currentVersion}`);
      console.log(`Last Solo tag:   ${lastTag ?? 'none'}`);
      console.log(`Total commits:   ${commits.length}`);
      console.log(`TCK commits:     ${analysis.tckCount}`);
      console.log(`Solo features:   ${analysis.soloFeatureCount}`);
      console.log(`Solo breaking:   ${analysis.soloBreakingCount}`);
      console.log(`Solo fixes:      ${analysis.soloFixCount}`);
      console.log(`Solo others:     ${analysis.soloOtherCount}`);
      console.log(`Bump type:       ${analysis.bumpType}`);
      console.log(`Next version:    ${analysis.nextVersion}`);
      console.log(`Decision:        ${analysis.reason}`);

      if (analysis.isTckOnly) {
        console.log('\nResult: STOP (TCK-only history, no Solo release)');
        process.exitCode = 2;
        return;
      }

      if (!analysis.shouldPrepareRelease) {
        console.log(`\nResult: STOP (${analysis.bumpType} bump, no documentation update needed)`);
        process.exitCode = 0;
        return;
      }

      console.log(`\nResult: PROCEED (Prepare minor release for ${analysis.nextVersion})`);
      process.exitCode = 0;
      return;
    }

    console.error(`Unknown action: ${action}`);
    process.exitCode = 1;
  }
}

// Auto-run if executed directly
if (process.argv[1]?.replaceAll('\\', '/').endsWith('scripts/solo-release-tooling.ts')) {
  SoloReleaseTooling.main(process.argv.slice(2));
}
