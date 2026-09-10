// SPDX-License-Identifier: Apache-2.0

import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import * as constants from '../../core/constants.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type DiagnosticsFinding, type DiagnosticsFindingCategory} from './diagnostics-finding.js';

const {green, yellow} = chalk;

interface ConsensusLogDefinition {
  entrySuffix: 'output/swirlds.log' | 'output/hgcaa.log';
  displayName: 'swirlds.log' | 'hgcaa.log';
  checkConsensusActive: boolean;
}

/**
 * Binds a log file path pattern to one or more suppression criteria used
 * while analyzing pod logs. Criteria can suppress known transient messages,
 * startup-only errors, or retry errors that later self-heal.
 *
 * Path patterns are matched against the file's relative path normalized to
 * forward slashes, so authors can write them portably.
 */
interface PodLogErrorSuppression {
  /** Matches the log file's relative path (forward-slash form). */
  logFilePattern: RegExp;
  /** Short reason describing why this suppression applies. */
  reason: string;
  /** Suppress matching message lines for this file. */
  transientMessagePattern?: RegExp;
  /** Suppress matching message lines only during the file's startup window. */
  startupTransientMessagePattern?: RegExp;
  /** Suppress startup entries when any line in the log entry block matches. */
  startupTransientBlockPattern?: RegExp;
  /** Suppress any error line within this many seconds from first log timestamp. */
  startupWindowSeconds?: number;
  /** Conditional suppression rules activated by success markers in the same file. */
  conditionalSuppressions?: readonly ConditionalLogSuppression[];
}

/**
 * A conditional suppression rule with simple state support:
 * activation occurs after N success matches, and suppression can optionally
 * apply only before that activation point to ignore startup-only failures.
 */
interface ConditionalLogSuppression {
  /** Error line pattern that may be suppressed when this rule activates. */
  errorPattern: RegExp;
  /** Success marker pattern that drives activation. */
  successPattern: RegExp;
  /** Minimum success matches required to activate. Defaults to 1. */
  minimumSuccessMatches?: number;
  /**
   * If true, suppress only error lines that occur before activation line.
   * If false, suppress matching errors anywhere once activated.
   */
  suppressOnlyBeforeActivation?: boolean;
  /**
   * Suppress an error only when a success marker appears *later* in the same log, proving the
   * component recovered from it. Errors with no subsequent success — a terminal outage rather than
   * a retried blip — still surface. Takes precedence over {@link suppressOnlyBeforeActivation}.
   */
  suppressWhenFollowedBySuccess?: boolean;
}

interface ActiveConditionalLogSuppression {
  rule: ConditionalLogSuppression;
  activationLineIndex: number;
  lastSuccessLineIndex: number;
}

/**
 * DiagnosticsAnalyzer scans a previously-collected diagnostics output directory
 * (produced by `deployment diagnostics logs`) and identifies common failure
 * signatures without requiring a live cluster connection.
 *
 * ## Input sources
 *
 * ### 1. Solo CLI log  (`solo.log`)
 * The Solo CLI's own Pino log file (`~/.solo/logs/solo.log` by default, or
 * `solo.log` found recursively under `customOutputDirectory`).  Lines
 * matching `] ERROR:` are captured as `app-error` findings.  ANSI escape
 * codes and `[traceId="..."]` suffixes are stripped before matching.
 *
 * ### 2. Pod describe files  (`*.describe.txt`)
 * Written by `downloadHieroComponentLogs()` for every pod in the collected scope
 * (all deployments by default, or a selected deployment when `--deployment` is set).
 * These are the output of `kubectl describe pod <name> -n <namespace>` and
 * contain the pod's status, container states, events, and resource usage.
 *
 * Detectable errors:
 *
 * | Category        | Detected keywords / conditions                                                         |
 * |-----------------|----------------------------------------------------------------------------------------|
 * | `image-pull`    | `ErrImagePull`, `ImagePullBackOff`, `Back-off pulling image`,                          |
 * |                 | `failed to pull and unpack image`, `unexpected EOF` (truncated layer),                 |
 * |                 | `toomanyrequests`, `rate limit exceeded`, `429 Too Many Requests`                      |
 * | `oom`           | `OOMKilled`, `out of memory`, `reason: OOMKilled`                                      |
 * | `pod-readiness` | Pod `Status` field is not `Running`, or `Ready: False` is present in container status; |
 * |                 | supporting `Reason:` / `Message:` lines are captured as evidence                       |
 *
 * ### 2. Consensus node log archives  (`*-log-config.zip`)
 * Written by `getNodeLogsAndConfigs()` under `~/.solo/logs/<namespace>/`.
 * Each zip contains the node's log and config snapshot.  Only two log files
 * inside the archive are inspected:
 *
 * - `output/swirlds.log` — Hashgraph platform log
 * - `output/hgcaa.log`   — Hedera application log
 *
 * Detectable errors:
 *
 * | Category           | Detected keywords / conditions                                                      |
 * |--------------------|-------------------------------------------------------------------------------------|
 * | `consensus-active` | `swirlds.log` never contains the word `ACTIVE` — the node stalled during           |
 * |                    | startup (e.g. stuck in `STARTING_UP`, `OBSERVING`, or `REPLAYING_EVENTS`);         |
 * |                    | status-transition lines are captured as evidence                                    |
 * | `log-exception`    | Any line in `swirlds.log` or `hgcaa.log` matching `Exception`, `Error`,            |
 * |                    | or `Caused by:` — the first matching stack-trace block (up to 14 lines) is         |
 * |                    | captured as evidence                                                                |
 *
 * ## Output
 * All findings are written to `diagnostics-analysis.txt` inside the input
 * directory.  Up to 10 findings are also printed to the terminal in severity
 * order.  Duplicate findings (same category + title + source) are suppressed.
 */
export class DiagnosticsAnalyzer {
  private static readonly CONSENSUS_LOG_DEFINITIONS: readonly ConsensusLogDefinition[] = [
    {entrySuffix: 'output/swirlds.log', displayName: 'swirlds.log', checkConsensusActive: true},
    {entrySuffix: 'output/hgcaa.log', displayName: 'hgcaa.log', checkConsensusActive: false},
  ];

  /**
   * Per-log suppression registry. Each entry binds a log-file pattern to one
   * or more suppression criteria and a reason. New suppressions can be added
   * here without touching scanner logic.
   */
  private static readonly POD_LOG_ERROR_SUPPRESSIONS: readonly PodLogErrorSuppression[] = [
    {
      // Mirror Node's FixCryptoAllowanceAmountMigration (an AsyncJavaMigration)
      // queries a temporary working table before it has been created on a
      // fresh database. The Java side handles this gracefully (logs WARN,
      // falls back to Long.MAX_VALUE), but Postgres still emits an ERROR
      // line into its server log, which would otherwise surface as a finding.
      // During startup, mirror-rest may attempt DB auth before role creation;
      // those FATAL auth lines are transient if they occur in early bring-up.
      logFilePattern: /solo-shared-resources-postgres[^/]*\.log$/i,
      transientMessagePattern: /relation "[^"]+" does not exist/i,
      startupTransientMessagePattern: /FATAL:\s+password authentication failed for user "mirror_rest"/i,
      startupWindowSeconds: 90,
      reason: 'Postgres "relation does not exist" during Flyway async-migration startup race',
    },
    {
      // The importer retries every block-node read. The node can be momentarily unreachable, close
      // the stream with an HTTP/2 GOAWAY, not yet hold the requested block, or serve a block whose
      // first item is not a block header. All of these are noise as long as the importer went on to
      // process further blocks, so they are matched broadly by source class rather than by message
      // text — enumerating individual messages is what let earlier drift ("source" vs "source:",
      // "server status" vs "server status detail") silently disable these rules. Suppression
      // requires a *later* success, so a terminal block-node outage still surfaces.
      logFilePattern: /mirror[^/]*-importer[^/]*\.log$/i,
      conditionalSuppressions: [
        {
          errorPattern: /Error downloading (?:signature )?files/i,
          successPattern: /RecordFileParser Successfully processed /i,
          minimumSuccessMatches: 2,
          suppressOnlyBeforeActivation: true,
        },
        {
          errorPattern: /BlockNode Failed to get server status(?: detail)? for BlockNode\(/i,
          successPattern: /RecordFileParser Successfully processed /i,
          minimumSuccessMatches: 2,
          suppressWhenFollowedBySuccess: true,
        },
        {
          errorPattern: /CompositeBlockSource Failed to get block from BLOCK_NODE source\b/i,
          successPattern: /RecordFileParser Successfully processed /i,
          minimumSuccessMatches: 2,
          suppressWhenFollowedBySuccess: true,
        },
      ],
      reason: 'Mirror Node importer block-node read retries that a later block success proves recovered',
    },
    {
      // When a block node supplies the stream, account balance files are not read from cloud
      // storage, so AccountBalancesDownloader polls a bucket that was never configured. The AWS SDK
      // reports that as an empty credential chain, and the paired request then times out. Both
      // recur for the lifetime of the pod rather than only during bring-up, so neither is
      // startup-scoped. The credential-chain text is itself the evidence that no S3/MinIO backend
      // is in use, which is why this does not need to know the deployment flags.
      logFilePattern: /mirror[^/]*-importer[^/]*\.log$/i,
      transientMessagePattern:
        /AccountBalancesDownloader Error downloading (?:signature )?files\b.*(?:Unable to load credentials from any of the providers in the chain|TimeoutException)/i,
      reason: 'Account balance downloader has no cloud storage configured; the block stream supplies balances',
    },
    {
      // Mirror Node REST API retries its Redis connection until the Redis
      // pod is reachable, logging an ERROR per attempt. A subsequent
      // "Startup Connected to redis://..." line proves the retry loop
      // succeeded — the earlier errors are then noise, not failures.
      logFilePattern: /mirror[^/]*-rest[^/]*\.log$/i,
      conditionalSuppressions: [
        {
          errorPattern: /Startup Error connecting to/i,
          successPattern: /Startup Connected to/i,
        },
      ],
      startupTransientMessagePattern:
        /Startup healthcheck failed DbError:\s+password authentication failed for user "mirror_rest"/i,
      startupTransientBlockPattern: /password authentication failed for user "mirror_rest"/i,
      startupWindowSeconds: 60,
      reason: 'Mirror Node REST retry succeeded after initial connection errors',
    },
    {
      // Mirror Node REST health checks can run before dependent services are
      // ready. In minified Node.js logs the ERROR header and the readiness
      // exception can be split across separate lines, so match the full log
      // entry block during the startup window.
      logFilePattern: /mirror[^/]*-rest[^/]*\.log$/i,
      startupTransientMessagePattern: /Startup healthcheck failed .*Application readiness check failed/i,
      startupTransientBlockPattern:
        /Application readiness check failed|^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+ERROR Startup healthcheck failed\s*$|^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+ERROR Startup healthcheck failed\s*\nError: connect ECONNREFUSED\b/i,
      startupWindowSeconds: 180,
      reason: 'Mirror Node REST readiness healthcheck during startup',
    },
    {
      // The read-side mirror components (rest, restjava, web3, grpc) accept scheduled work as soon as
      // they boot, which can precede the importer's Flyway migration that creates the tables they
      // query. The header line and the nested "Caused by:" lines all carry the message, so a message
      // pattern covers the whole entry.
      logFilePattern: /mirror[^/]*-(?:rest|web3|grpc)[^/]*\.log$/i,
      startupTransientMessagePattern: /relation "[^"]+" does not exist/i,
      startupWindowSeconds: 180,
      reason: 'Mirror Node REST queried a table before the importer schema migration created it',
    },
  ];

  /**
   * Report ordering for finding categories; the lowest value is the most severe. Used for both the
   * `diagnostics-analysis.txt` report and the terminal summary so the two agree.
   */
  private static readonly CATEGORY_SEVERITY_ORDER: Record<DiagnosticsFindingCategory, number> = {
    'image-pull': 1,
    oom: 2,
    'pod-readiness': 3,
    'consensus-active': 4,
    'log-exception': 5,
    'app-error': 6,
  };

  /** Matches an ISO-8601 timestamp at the start of an application log line. */
  private static readonly LOG_LINE_TIMESTAMP_PATTERN: RegExp =
    /^\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/;
  /**
   * Known solo.log transient errors that should not produce diagnostics findings.
   * When block-node logs are copied while the file is still being written,
   * copy verification can fail with a size mismatch.
   */
  private static readonly SOLO_LOG_TRANSIENT_ERROR_PATTERNS: readonly RegExp[] = [
    /Failed to download block node log files from .*copy verification failed: expected size \d+ but found \d+ at .*blocknode-\d+\.log/i,
  ];

  public constructor(private readonly logger: SoloLogger) {}

  /**
   * Run the full analysis against `customOutputDirectory` (or the default
   * `~/.solo/logs/hiero-components-logs` when empty).
   *
   * Consensus node zip archives are looked up under
   * `~/.solo/logs/<namespaceName>/` when `namespaceName` is provided, or
   * directly under `~/.solo/logs/` otherwise.
   */
  public analyze(customOutputDirectory: string, namespaceName: string | undefined): void {
    const hieroOutputDirectory: string = customOutputDirectory
      ? path.resolve(customOutputDirectory)
      : PathEx.join(constants.SOLO_LOGS_DIR, 'hiero-components-logs');
    const findings: DiagnosticsFinding[] = [];

    this.logger.showUser(`Scanning directory: ${hieroOutputDirectory}`);

    if (fs.existsSync(hieroOutputDirectory)) {
      this.analyzeDescribeFiles(hieroOutputDirectory, findings);
    } else {
      this.logger.showUser(yellow(`  Pod describe directory not found, skipping: ${hieroOutputDirectory}`));
    }

    let consensusArchiveDirectory: string = constants.SOLO_LOGS_DIR;
    if (customOutputDirectory) {
      consensusArchiveDirectory = path.resolve(customOutputDirectory);
    } else if (namespaceName) {
      consensusArchiveDirectory = PathEx.join(constants.SOLO_LOGS_DIR, namespaceName);
    }
    if (fs.existsSync(consensusArchiveDirectory)) {
      this.analyzeConsensusNodeArchives(consensusArchiveDirectory, findings);
    } else {
      this.logger.showUser(yellow(`  Consensus archive directory not found, skipping: ${consensusArchiveDirectory}`));
    }

    if (fs.existsSync(hieroOutputDirectory)) {
      this.analyzePodLogFiles(hieroOutputDirectory, findings);
    }

    if (fs.existsSync(hieroOutputDirectory)) {
      this.analyzeSoloLogFiles(hieroOutputDirectory, customOutputDirectory, findings);
    } else {
      this.logger.showUser(yellow(`  Diagnostics output directory not found, skipping: ${hieroOutputDirectory}`));
    }

    if (!fs.existsSync(hieroOutputDirectory)) {
      fs.mkdirSync(hieroOutputDirectory, {recursive: true});
    }

    const reportPath: string = PathEx.join(hieroOutputDirectory, 'diagnostics-analysis.txt');
    this.logger.showUser(`Writing report to: ${reportPath}`);
    const reportText: string = this.renderDiagnosticsFindings(findings);
    fs.writeFileSync(reportPath, reportText, 'utf8');

    if (findings.length > 0) {
      this.logger.showUser(
        yellow(
          `Detected ${findings.length} potential issue(s) from diagnostics logs. Summary written to ${reportPath}`,
        ),
      );
      for (const [index, finding] of DiagnosticsAnalyzer.orderFindingsBySeverity(findings).slice(0, 10).entries()) {
        this.logger.showUser(`${index + 1}. ${finding.title} [${finding.source}]`);
        if (finding.evidence.length > 0) {
          const maxEvidenceLines: number =
            finding.category === 'log-exception' || finding.category === 'pod-readiness' ? 8 : 4;
          for (const evidenceLine of finding.evidence.slice(0, maxEvidenceLines)) {
            this.logger.showUser(`   - ${evidenceLine}`);
          }
          if (finding.evidence.length > maxEvidenceLines) {
            this.logger.showUser(
              `   ... and ${finding.evidence.length - maxEvidenceLines} more evidence line(s) in diagnostics-analysis.txt`,
            );
          }
        }
      }
      if (findings.length > 10) {
        this.logger.showUser(`... and ${findings.length - 10} more. See diagnostics-analysis.txt for details.`);
      }
    } else {
      this.logger.showUser(green(`No common failure signatures detected. Report: ${reportPath}`));
    }
  }

  /**
   * Recursively scans `rootDirectory` for `*.describe.txt` files (one per pod)
   * and checks each for image-pull failures, OOM kills, and pod-readiness
   * problems.
   *
   * Detected errors:
   *  - `image-pull`    ErrImagePull / ImagePullBackOff / rate-limit / unexpected EOF
   *  - `oom`           OOMKilled / out of memory
   *  - `pod-readiness` Status != Running  OR  Ready: False
   */
  private analyzeDescribeFiles(rootDirectory: string, findings: DiagnosticsFinding[]): void {
    const describeFiles: string[] = this.collectFilesRecursively(rootDirectory, (filePath: string): boolean =>
      filePath.endsWith('.describe.txt'),
    );

    // Matches any image-pull error surfaced in `kubectl describe pod` output.
    // Covers:
    //   - ErrImagePull / ImagePullBackOff  (standard Kubernetes pull errors)
    //   - "Back-off pulling image"          (CRI back-off message in Events)
    //   - "failed to pull and unpack image" (containerd error)
    //   - "unexpected EOF"                  (truncated layer download)
    //   - toomanyrequests / rate limit exceeded / 429 Too Many Requests
    //     (Docker Hub and other registries throttle anonymous pulls)
    const imagePullPattern: RegExp =
      /ErrImagePull|ImagePullBackOff|Back-off pulling image|failed to pull and unpack image|unexpected EOF|toomanyrequests|rate limit exceeded|429 Too Many Requests/i;

    // Matches out-of-memory kills.
    // "OOMKilled" appears in the container's LastTerminationState and in Events.
    // "reason: OOMKilled" is the structured field in the container status JSON.
    //
    // Exit code 137 (128 + SIGKILL) is included because the kubelet does not always attribute a
    // memory-limit kill to OOMKilled: a container killed after exceeding its limit is frequently
    // recorded as `exitCode: 137` with `reason: Error`, which none of the OOMKilled spellings
    // match. Such a pod can also be `Running` and `Ready` at collection time — having already
    // restarted — so the pod-readiness check does not flag it either, leaving a container that has
    // been killed repeatedly completely invisible.
    const oomPattern: RegExp = /OOMKilled|out of memory|reason:\s*OOMKilled|(?:exitCode|Exit Code):\s*137\b/i;
    // Restart counts are captured alongside the OOM evidence: they show whether the kill happened
    // once or is an ongoing loop, which the exit code alone does not convey.
    const restartCountPattern: RegExp = /^\s*restartCount:\s*[1-9]\d*\s*$/im;

    this.logger.showUser(`  Found ${describeFiles.length} pod describe file(s)`);

    for (const describeFile of describeFiles) {
      const relatedPath: string = path.relative(rootDirectory, describeFile);
      this.logger.showUser(`  Reading: ${relatedPath}`);
      let content: string;
      try {
        content = fs.readFileSync(describeFile, 'utf8');
      } catch (error) {
        this.logger.showUser(yellow(`  Unable to read describe file ${relatedPath}: ${(error as Error).message}`));
        continue;
      }

      const podName: string = path.basename(describeFile, '.describe.txt');
      const source: string = path.relative(rootDirectory, describeFile);

      if (imagePullPattern.test(content)) {
        this.addDiagnosticsFinding(findings, {
          category: 'image-pull',
          title: `Image pull failure detected for pod ${podName}`,
          source,
          evidence: this.extractMatchSnippets(content, imagePullPattern, 8),
        });
      }

      if (oomPattern.test(content)) {
        this.addDiagnosticsFinding(findings, {
          category: 'oom',
          title: `OOM-related failure detected for pod ${podName}`,
          source,
          evidence: [
            ...this.extractMatchSnippets(content, oomPattern, 6),
            ...this.extractMatchSnippets(content, restartCountPattern, 2),
          ],
        });
      }

      // A pod is unhealthy if its top-level status is anything other than
      // "Running" or if any container is not ready.
      //
      // Two file formats are possible depending on how the describe file was
      // collected:
      //   - Text format (kubectl describe pod):  "Status: Pending"
      //                                          "Ready: False"
      //   - YAML format (kubectl get pod -o yaml): "phase: Pending"
      //                                            "ready: false"
      //
      // Both are matched so the check is format-agnostic.
      // Reason: / Message: / Exit Code: / reason: / message: / exitCode:
      // lines are captured for additional context.
      const statusMatch: RegExpMatchArray = content.match(/^\s*(?:Status|phase):\s+([^\n]+)/m);
      const status: string = statusMatch?.[1]?.trim().replaceAll(/^"|"$/g, '') ?? '';
      const readyFalse: boolean = /^\s*[Rr]eady:\s+[Ff]alse\b/m.test(content);
      if ((status && status !== constants.POD_PHASE_RUNNING) || readyFalse) {
        const evidence: string[] = [];
        if (status) {
          evidence.push(`Status: ${status}`);
        }
        if (readyFalse) {
          evidence.push('Ready: False');
        }
        evidence.push(
          ...this.extractMatchSnippetsJoiningContinuations(content, /^\s*(Reason|Message|Exit Code|exitCode):\s+/i, 8),
        );

        this.addDiagnosticsFinding(findings, {
          category: 'pod-readiness',
          title: `Pod not ready/running: ${podName}`,
          source,
          evidence,
        });
      }
    }
  }

  /**
   * Recursively scans `rootDirectory` for `*.log` pod log files and checks each
   * for application-level ERROR lines (category: `app-error`).
   *
   * These are the raw container logs downloaded by `downloadHieroComponentLogs()`
   * alongside the `*.describe.txt` files. Each file is scanned for lines carrying an `ERROR` or
   * `FATAL` level, plus the level-less failures the JVM prints directly (`OutOfMemoryError`, and
   * `Exception` as a standalone word), and the first matching block (up to 8 lines) is captured.
   */
  private analyzePodLogFiles(rootDirectory: string, findings: DiagnosticsFinding[]): void {
    // Only scan logs for non-consensus components. Consensus node logs are
    // handled separately via the *-log-config.zip archives (which include
    // swirlds.log and hgcaa.log).  Broad *.log would match those files too
    // and produce duplicate / noisy findings.
    const componentLogPattern: RegExp = /[\\/](?:mirror|block|relay|explorer|solo-shared)[^/\\]*\.log$/i;
    const logFiles: string[] = this.collectFilesRecursively(rootDirectory, (filePath: string): boolean =>
      componentLogPattern.test(filePath),
    );

    // Strip Docker/containerd timestamp prefix (e.g. "2026-04-06T03:24:32.470558065Z ") before matching.
    // A level token alone is not enough. The block node logs through java.util.logging, whose
    // levels are FINE/INFO/WARNING/SEVERE, and the JVM prints failures with no level at all:
    //
    //   java.lang.OutOfMemoryError: Java heap space
    //   Exception in thread "server-@default-listener" java.lang.OutOfMemoryError: Java heap space
    //
    // Neither contains ERROR or FATAL as a word ("OutOfMemoryError" has no word boundary before
    // "Error"), so an entire block node log recording a heap death produced no finding at all.
    //
    // "Exception" is matched only as a standalone word, and case-sensitively. That is deliberately
    // narrow: it catches `Exception in thread ...` while skipping class-name suffixes such as
    // `io.helidon.common.socket.SocketWriterException` — low-level connection churn that a server
    // logs routinely, often below ERROR — because there is no word boundary before "Exception"
    // there. Case sensitivity keeps prose like "configured exception handling" from matching.
    const errorPattern: RegExp = /\b(?:ERROR|FATAL)\b|\bOutOfMemoryError\b|\bException\b/;

    this.logger.showUser(`  Found ${logFiles.length} pod log file(s)`);

    for (const logFile of logFiles) {
      const relativePath: string = path.relative(rootDirectory, logFile);
      this.logger.showUser(`  Reading: ${relativePath}`);
      let content: string;
      try {
        content = fs.readFileSync(logFile, 'utf8');
      } catch (error) {
        this.logger.showUser(yellow(`  Unable to read log file ${relativePath}: ${(error as Error).message}`));
        continue;
      }

      // Strip leading container-runtime timestamps so the pattern matches the application log line.
      const strippedContent: string = content.replaceAll(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/gm, '');
      if (!errorPattern.test(strippedContent)) {
        continue;
      }

      const podName: string = path.basename(logFile, '.log');
      const errorScan: {evidence: string[]; suppressed: number} = this.extractFilteredErrorSnippets(
        strippedContent,
        errorPattern,
        relativePath,
        8,
      );
      if (errorScan.suppressed > 0) {
        this.logger.showUser(`  Suppressed ${errorScan.suppressed} transient error line(s) in ${relativePath}`);
      }
      if (errorScan.evidence.length === 0) {
        continue;
      }
      // Heap exhaustion is not a routine ERROR line — it is an out-of-memory death, and the pod's
      // describe file may not show it at all when the container restarted and became Ready again.
      // Reported under `oom` so it ranks with the other memory kills instead of last among
      // app-errors, where the ten-finding terminal summary would push it out of sight.
      const isHeapExhaustion: boolean = errorScan.evidence.some((line: string): boolean =>
        /\bOutOfMemoryError\b/.test(line),
      );
      this.addDiagnosticsFinding(
        findings,
        isHeapExhaustion
          ? {
              category: 'oom',
              title: `JVM heap exhaustion detected in pod log: ${podName}`,
              source: relativePath,
              evidence: errorScan.evidence,
            }
          : {
              category: 'app-error',
              title: `Application ERROR detected in pod log: ${podName}`,
              source: relativePath,
              evidence: errorScan.evidence,
            },
      );
    }
  }

  /**
   * Searches for `solo.log` in `hieroOutputDirectory` (recursively) and, when
   * no custom output directory was specified, also checks the standard
   * `~/.solo/logs/solo.log` location.  ERROR lines are extracted and reported
   * as `app-error` findings.
   *
   */
  private analyzeSoloLogFiles(
    hieroOutputDirectory: string,
    customOutputDirectory: string,
    findings: DiagnosticsFinding[],
  ): void {
    const soloLogFiles: string[] = this.collectFilesRecursively(
      hieroOutputDirectory,
      (filePath: string): boolean => path.basename(filePath) === 'solo.log',
    );

    // When using the default output path, the solo.log lives one level up at
    // ~/.solo/logs/solo.log — outside hieroOutputDirectory, so check it separately.
    if (!customOutputDirectory) {
      const defaultSoloLog: string = PathEx.join(constants.SOLO_LOGS_DIR, 'solo.log');
      if (fs.existsSync(defaultSoloLog) && !soloLogFiles.includes(defaultSoloLog)) {
        soloLogFiles.push(defaultSoloLog);
      }
    }

    this.logger.showUser(`  Found ${soloLogFiles.length} solo log file(s)`);

    // Anchor to the Pino entry prefix "[HH:MM:SS.mmm] ERROR:" so that INFO/WARN
    // entries which quote a downstream "] ERROR:" fragment (e.g. when the
    // diagnostics report itself is logged) do not produce false-positive matches.
    const errorPattern: RegExp = /^\[\d{2}:\d{2}:\d{2}\.\d{3}]\s+ERROR:/m;
    // eslint-disable-next-line no-control-regex
    const ansiPattern: RegExp = new RegExp('\u001B\\[[0-9;]*m', 'g');
    const traceIdPattern: RegExp = /\s+\[traceId="[^"]*"\]/g;

    for (const soloLogFile of soloLogFiles) {
      const relativePath: string = path.relative(hieroOutputDirectory, soloLogFile);
      const sourceLabel: string = relativePath || path.basename(soloLogFile);
      this.logger.showUser(`  Reading: ${sourceLabel}`);
      let content: string;
      try {
        content = fs.readFileSync(soloLogFile, 'utf8');
      } catch (error) {
        this.logger.showUser(yellow(`  Unable to read solo log ${sourceLabel}: ${(error as Error).message}`));
        continue;
      }

      const cleanedContent: string = content.replaceAll(ansiPattern, '').replaceAll(traceIdPattern, '');
      if (!errorPattern.test(cleanedContent)) {
        continue;
      }

      const errorScan: {evidence: string[]; suppressed: number} = this.extractSoloLogErrorBlocks(cleanedContent, 3, 14);
      if (errorScan.suppressed > 0) {
        this.logger.showUser(`  Suppressed ${errorScan.suppressed} transient error line(s) in ${sourceLabel}`);
      }
      if (errorScan.evidence.length === 0) {
        continue;
      }
      this.addDiagnosticsFinding(findings, {
        category: 'app-error',
        title: 'ERROR detected in solo.log',
        source: sourceLabel,
        evidence: errorScan.evidence,
      });
    }
  }

  /**
   * Recursively scans `archiveRootDirectory` for `*-log-config.zip` archives
   * produced by `getNodeLogsAndConfigs()` and inspects two log files inside
   * each archive:
   *
   *  - `output/swirlds.log` — checked for absence of the `ACTIVE` platform
   *    status marker (category: `consensus-active`) and for exception blocks
   *    (category: `log-exception`).
   *  - `output/hgcaa.log`   — checked for exception blocks only
   *    (category: `log-exception`).
   *
   * Only the first exception block per log file is captured (up to 14 lines)
   * to keep the report readable.
   */
  private analyzeConsensusNodeArchives(archiveRootDirectory: string, findings: DiagnosticsFinding[]): void {
    const archiveFiles: string[] = this.collectFilesRecursively(archiveRootDirectory, (filePath: string): boolean =>
      filePath.endsWith('-log-config.zip'),
    );

    this.logger.showUser(`  Found ${archiveFiles.length} consensus log archive(s)`);

    for (const archiveFile of archiveFiles) {
      const archiveName: string = path.basename(archiveFile);
      this.logger.showUser(`  Unzipping: ${archiveName}`);
      let archive: AdmZip;
      try {
        archive = new AdmZip(archiveFile, {readEntries: true});
      } catch (error) {
        this.logger.showUser(yellow(`  Unable to read archive ${archiveName}: ${(error as Error).message}`));
        continue;
      }

      for (const entry of archive.getEntries()) {
        const logDefinition: ConsensusLogDefinition | undefined = this.findConsensusLogDefinition(entry.entryName);
        if (!logDefinition) {
          continue;
        }
        this.analyzeConsensusLogEntry(archiveName, entry, logDefinition, findings);
      }
    }
  }

  private findConsensusLogDefinition(entryName: string): ConsensusLogDefinition | undefined {
    return DiagnosticsAnalyzer.CONSENSUS_LOG_DEFINITIONS.find((logDefinition: ConsensusLogDefinition): boolean =>
      entryName.endsWith(logDefinition.entrySuffix),
    );
  }

  private analyzeConsensusLogEntry(
    archiveName: string,
    entry: AdmZip.IZipEntry,
    logDefinition: ConsensusLogDefinition,
    findings: DiagnosticsFinding[],
  ): void {
    this.logger.showUser(`    Reading entry: ${entry.entryName}`);
    const source: string = `${archiveName}:${entry.entryName}`;
    const content: string = entry.getData().toString('utf8');

    if (logDefinition.checkConsensusActive) {
      this.analyzeConsensusActiveStatus(content, source, findings);
    }
    this.analyzeExceptionBlocks(logDefinition.displayName, content, source, findings);
  }

  /**
   * A healthy consensus node transitions through STARTING_UP → OBSERVING →
   * REPLAYING_EVENTS → ACTIVE. If `ACTIVE` never appears in swirlds.log,
   * the node likely stalled before becoming ready for transactions.
   */
  private analyzeConsensusActiveStatus(content: string, source: string, findings: DiagnosticsFinding[]): void {
    if (/\bACTIVE\b/.test(content)) {
      return;
    }

    const evidence: string[] = this.extractMatchSnippets(
      content,
      /PlatformStatus|status|STARTING_UP|OBSERVING|REPLAYING_EVENTS|FREEZING|ACTIVE/i,
      8,
    );
    if (evidence.length === 0) {
      evidence.push('No ACTIVE status marker found in swirlds.log');
    }

    this.addDiagnosticsFinding(findings, {
      category: 'consensus-active',
      title: 'Consensus node may not have reached ACTIVE status',
      source,
      evidence,
    });
  }

  /**
   * Captures the first exception/stack-trace block from a consensus log file.
   */
  private analyzeExceptionBlocks(
    logDisplayName: ConsensusLogDefinition['displayName'],
    content: string,
    source: string,
    findings: DiagnosticsFinding[],
  ): void {
    const exceptionBlocks: string[] = this.extractExceptionBlocks(content, 1, 14);
    if (exceptionBlocks.length === 0) {
      return;
    }

    this.addDiagnosticsFinding(findings, {
      category: 'log-exception',
      title: `Exception detected in ${logDisplayName}`,
      source,
      evidence: exceptionBlocks[0].split('\n').filter((line: string): boolean => line.trim().length > 0),
    });
  }

  /**
   * Adds `finding` to `findings` unless an identical entry (same category,
   * title, and source) already exists.  Evidence lines are deduplicated and
   * capped at 14 entries to keep the report compact.
   */
  private addDiagnosticsFinding(findings: DiagnosticsFinding[], finding: DiagnosticsFinding): void {
    const key: string = `${finding.category}|${finding.title}|${finding.source}`;
    const existingKeys: Set<string> = new Set(
      findings.map((item: DiagnosticsFinding): string => `${item.category}|${item.title}|${item.source}`),
    );
    if (existingKeys.has(key)) {
      return;
    }

    findings.push({
      ...finding,
      evidence: [...new Set(finding.evidence)].filter((line: string): boolean => line.trim().length > 0).slice(0, 14),
    });
  }

  /**
   * Walks `rootDirectory` recursively and returns all file paths for which
   * `matcher` returns `true`.
   */
  private collectFilesRecursively(rootDirectory: string, matcher: (filePath: string) => boolean): string[] {
    const files: string[] = [];
    const visit: (directory: string) => void = (directory: string): void => {
      const entries: fs.Dirent[] = fs.readdirSync(directory, {withFileTypes: true});
      for (const entry of entries) {
        const entryPath: string = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          visit(entryPath);
          continue;
        }
        if (entry.isFile() && matcher(entryPath)) {
          files.push(entryPath);
        }
      }
    };

    visit(rootDirectory);
    return files;
  }

  /**
   * Extracts up to `maxBlocks` ERROR blocks from a solo.log file.
   *
   * Each block starts on a line matching `] ERROR:` and continues while
   * subsequent lines are indented (part of the Pino `err:` object dump).
   * A new log entry — any line starting with `[HH:MM:SS` — terminates the
   * current block.  Each block is capped at `maxLinesPerBlock` lines.
   *
   * Evidence lines are returned flat (one string per line) in
   * `"line <N>: <content>"` format so they render consistently with other
   * findings.
   */
  private extractSoloLogErrorBlocks(
    content: string,
    maxBlocks: number,
    maxLinesPerBlock: number,
  ): {evidence: string[]; suppressed: number} {
    const lines: string[] = content.split(/\r?\n/);
    // Anchored to the Pino entry prefix to skip INFO/WARN lines that quote
    // a downstream "] ERROR:" fragment as part of their message body.
    const errorPattern: RegExp = /^\[\d{2}:\d{2}:\d{2}\.\d{3}]\s+ERROR:/;
    // New Pino log entries start with a bracketed timestamp, e.g. "[17:25:23.788]"
    const newEntryPattern: RegExp = /^\[\d{2}:\d{2}:\d{2}\.\d{3}]/;
    const evidence: string[] = [];
    let blocksCollected: number = 0;
    let suppressed: number = 0;

    for (let index: number = 0; index < lines.length && blocksCollected < maxBlocks; index++) {
      if (!errorPattern.test(lines[index])) {
        continue;
      }

      const blockLines: string[] = [`line ${index + 1}: ${lines[index].trim()}`];
      let next: number = index + 1;
      while (next < lines.length && blockLines.length < maxLinesPerBlock) {
        const nextLine: string = lines[next];
        // Stop at the next log entry or a blank line that precedes one
        if (newEntryPattern.test(nextLine)) {
          break;
        }
        if (nextLine.trim().length > 0) {
          blockLines.push(`line ${next + 1}: ${nextLine.trim()}`);
        }
        next++;
      }

      const blockText: string = blockLines.join('\n');
      if (
        DiagnosticsAnalyzer.SOLO_LOG_TRANSIENT_ERROR_PATTERNS.some((pattern: RegExp): boolean =>
          pattern.test(blockText),
        )
      ) {
        suppressed++;
        index = next - 1;
        continue;
      }

      evidence.push(...blockLines);
      blocksCollected++;
      index = next - 1;
    }

    return {evidence, suppressed};
  }

  /**
   * Returns up to `maxMatches` lines from `content` that match `pattern`,
   * formatted as `"line <N>: <trimmed line>"`.
   *
   * The global (`g`) flag is stripped before matching so the RegExp lastIndex
   * does not interfere with repeated calls against the same pattern instance.
   */
  private extractMatchSnippets(content: string, pattern: RegExp, maxMatches: number): string[] {
    const snippets: string[] = [];
    const {lines, matcher}: {lines: string[]; matcher: RegExp} = this.initializeLineMatcher(content, pattern);

    for (const [index, line] of lines.entries()) {
      if (matcher.test(line)) {
        snippets.push(`line ${index + 1}: ${line.trim()}`);
        if (snippets.length >= maxMatches) {
          break;
        }
      }
    }

    return snippets;
  }

  private initializeLineMatcher(content: string, pattern: RegExp): {lines: string[]; matcher: RegExp} {
    return {
      lines: content.split(/\r?\n/),
      matcher: new RegExp(
        pattern.source,
        pattern.flags.includes('g') ? pattern.flags.replaceAll('g', '') : pattern.flags,
      ),
    };
  }

  private getPodLogErrorSuppressionsForFile(relativePath: string): readonly PodLogErrorSuppression[] {
    const normalizedPath: string = relativePath.replaceAll('\\', '/');
    return DiagnosticsAnalyzer.POD_LOG_ERROR_SUPPRESSIONS.filter((suppression: PodLogErrorSuppression): boolean =>
      suppression.logFilePattern.test(normalizedPath),
    );
  }

  private getStartupSuppressionWindow(suppressions: readonly PodLogErrorSuppression[]): number {
    const matchingWindows: number[] = [];
    for (const suppression of suppressions) {
      if (suppression.startupWindowSeconds !== undefined && suppression.startupTransientMessagePattern === undefined) {
        matchingWindows.push(suppression.startupWindowSeconds);
      }
    }
    return matchingWindows.length === 0 ? 0 : Math.max(...matchingWindows);
  }

  private getTransientMessagePatterns(suppressions: readonly PodLogErrorSuppression[]): readonly RegExp[] {
    const patterns: RegExp[] = [];
    for (const suppression of suppressions) {
      if (suppression.transientMessagePattern !== undefined) {
        patterns.push(suppression.transientMessagePattern);
      }
    }
    return patterns;
  }

  private getLogEntryBlockText(lines: readonly string[], startIndex: number): string {
    const blockLines: string[] = [];
    for (let index: number = startIndex; index < lines.length; index++) {
      if (index > startIndex && DiagnosticsAnalyzer.LOG_LINE_TIMESTAMP_PATTERN.test(lines[index])) {
        break;
      }
      blockLines.push(lines[index]);
    }
    return blockLines.join('\n');
  }

  private getActiveConditionalSuppressions(
    suppressions: readonly PodLogErrorSuppression[],
    lines: readonly string[],
  ): readonly ActiveConditionalLogSuppression[] {
    const activeSuppressions: ActiveConditionalLogSuppression[] = [];
    for (const suppression of suppressions) {
      if (suppression.conditionalSuppressions === undefined) {
        continue;
      }
      for (const rule of suppression.conditionalSuppressions) {
        const minimumSuccessMatches: number = Math.max(1, rule.minimumSuccessMatches ?? 1);
        const successLineIndexes: number[] = [];
        for (const [index, line] of lines.entries()) {
          if (rule.successPattern.test(line)) {
            successLineIndexes.push(index);
          }
        }
        if (successLineIndexes.length < minimumSuccessMatches) {
          continue;
        }
        activeSuppressions.push({
          rule,
          activationLineIndex: successLineIndexes[minimumSuccessMatches - 1],
          lastSuccessLineIndex: successLineIndexes.at(-1),
        });
      }
    }
    return activeSuppressions;
  }

  private isConditionallySuppressed(
    line: string,
    lineIndex: number,
    activeSuppressions: readonly ActiveConditionalLogSuppression[],
  ): boolean {
    return activeSuppressions.some((activeSuppression: ActiveConditionalLogSuppression): boolean => {
      if (!activeSuppression.rule.errorPattern.test(line)) {
        return false;
      }
      if (activeSuppression.rule.suppressWhenFollowedBySuccess) {
        return lineIndex < activeSuppression.lastSuccessLineIndex;
      }
      if (activeSuppression.rule.suppressOnlyBeforeActivation) {
        return lineIndex < activeSuppression.activationLineIndex;
      }
      return true;
    });
  }

  /**
   * Parses an ISO-8601 timestamp possibly carrying sub-millisecond precision
   * (e.g. nanoseconds from container runtimes).  JavaScript Date only handles
   * three fractional digits, so longer precision is truncated.  Returns
   * undefined when the string cannot be parsed.
   */
  private parseLogTimestamp(text: string): Date | undefined {
    const normalizedText: string = text.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
    const parsedDate: Date = new Date(normalizedText);
    return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
  }

  /**
   * Returns the timestamp of the first line in `content` that carries one,
   * or undefined if no timestamped line is found.  Used as the start-of-log
   * reference point for {@link isWithinStartupWindow}.
   */
  private findFirstTimestamp(content: string): Date | undefined {
    const lines: string[] = content.split(/\r?\n/);
    for (const line of lines) {
      const timestampMatch: RegExpMatchArray | null = line.match(DiagnosticsAnalyzer.LOG_LINE_TIMESTAMP_PATTERN);
      if (!timestampMatch) {
        continue;
      }
      const parsedDate: Date | undefined = this.parseLogTimestamp(timestampMatch[1]);
      if (parsedDate) {
        return parsedDate;
      }
    }
    return undefined;
  }

  /**
   * Returns true when `line` carries a timestamp at or before
   * `startTime + windowSeconds`.  Lines without a parseable timestamp are
   * NOT considered within the window — we err on the side of surfacing the
   * error rather than hiding it.
   */
  private isWithinStartupWindow(line: string, startTime: Date, windowSeconds: number): boolean {
    const timestampMatch: RegExpMatchArray | null = line.match(DiagnosticsAnalyzer.LOG_LINE_TIMESTAMP_PATTERN);
    if (!timestampMatch) {
      return false;
    }
    const lineTime: Date | undefined = this.parseLogTimestamp(timestampMatch[1]);
    if (!lineTime) {
      return false;
    }
    const deltaSeconds: number = (lineTime.getTime() - startTime.getTime()) / 1000;
    return deltaSeconds <= windowSeconds;
  }

  /**
   * Like {@link extractMatchSnippets} but drops error lines that fall into
   * any of three suppression categories configured for `relativePath`:
   *   1. transient message patterns        — known benign messages
   *   2. startup-scoped message patterns   — known benign messages only during bring-up
   *   3. startup grace window              — within N seconds of log start
   *   4. success-activated conditional rules
   *
   * Suppression is block-aware: a log entry is a header line (timestamp at
   * start of line) plus all following lines until the next header. When the
   * header is suppressed, every continuation match within the block (e.g.
   * `Suppressed: ... terminated with an error` inside a stack trace) is
   * cascaded into the same suppression.
   *
   * Returns both the captured evidence (capped at `maxMatches`) and the
   * number of lines that were suppressed so callers can surface a note.
   */
  private extractFilteredErrorSnippets(
    content: string,
    errorPattern: RegExp,
    relativePath: string,
    maxMatches: number,
  ): {evidence: string[]; suppressed: number} {
    const {lines, matcher}: {lines: string[]; matcher: RegExp} = this.initializeLineMatcher(content, errorPattern);
    const matchingSuppressions: readonly PodLogErrorSuppression[] =
      this.getPodLogErrorSuppressionsForFile(relativePath);
    const transientPatterns: readonly RegExp[] = this.getTransientMessagePatterns(matchingSuppressions);
    const hasStartupSuppression: boolean = matchingSuppressions.some(
      (suppression: PodLogErrorSuppression): boolean => suppression.startupWindowSeconds !== undefined,
    );
    const startupWindowSeconds: number = this.getStartupSuppressionWindow(matchingSuppressions);
    const startupReferenceTime: Date | undefined = hasStartupSuppression ? this.findFirstTimestamp(content) : undefined;
    const hasStartupTransientSuppression: boolean = matchingSuppressions.some(
      (suppression: PodLogErrorSuppression): boolean =>
        (suppression.startupTransientMessagePattern !== undefined ||
          suppression.startupTransientBlockPattern !== undefined) &&
        suppression.startupWindowSeconds !== undefined,
    );
    const activeConditionalSuppressions: readonly ActiveConditionalLogSuppression[] =
      this.getActiveConditionalSuppressions(matchingSuppressions, lines);

    const evidence: string[] = [];
    let suppressed: number = 0;
    let inErrorBlock: boolean = false;
    let blockSuppressed: boolean = false;

    for (const [index, line] of lines.entries()) {
      // A new timestamped log entry ends any open error block. Stack-trace
      // continuation lines (no leading timestamp) inherit the prior block.
      if (DiagnosticsAnalyzer.LOG_LINE_TIMESTAMP_PATTERN.test(line)) {
        inErrorBlock = false;
        blockSuppressed = false;
      }

      if (!matcher.test(line)) {
        continue;
      }

      // Continuation matches (e.g. "Suppressed: ... terminated with an error"
      // inside a stack trace) inherit the header's suppression decision.
      if (inErrorBlock) {
        if (blockSuppressed) {
          suppressed++;
        } else if (evidence.length < maxMatches) {
          evidence.push(`line ${index + 1}: ${line.trim()}`);
        }
        continue;
      }

      inErrorBlock = true;

      const isTransientMessage: boolean = transientPatterns.some((transientPattern: RegExp): boolean =>
        transientPattern.test(line),
      );
      if (isTransientMessage) {
        suppressed++;
        blockSuppressed = true;
        continue;
      }
      const isStartupTransientMessage: boolean =
        startupReferenceTime !== undefined &&
        hasStartupTransientSuppression &&
        matchingSuppressions.some((suppression: PodLogErrorSuppression): boolean => {
          if (
            suppression.startupWindowSeconds === undefined ||
            !this.isWithinStartupWindow(line, startupReferenceTime, suppression.startupWindowSeconds)
          ) {
            return false;
          }
          if (suppression.startupTransientMessagePattern?.test(line)) {
            return true;
          }
          return (
            suppression.startupTransientBlockPattern !== undefined &&
            suppression.startupTransientBlockPattern.test(this.getLogEntryBlockText(lines, index))
          );
        });
      if (isStartupTransientMessage) {
        suppressed++;
        blockSuppressed = true;
        continue;
      }
      if (
        startupReferenceTime !== undefined &&
        startupWindowSeconds > 0 &&
        this.isWithinStartupWindow(line, startupReferenceTime, startupWindowSeconds)
      ) {
        suppressed++;
        blockSuppressed = true;
        continue;
      }
      if (this.isConditionallySuppressed(line, index, activeConditionalSuppressions)) {
        suppressed++;
        blockSuppressed = true;
        continue;
      }
      if (evidence.length < maxMatches) {
        evidence.push(`line ${index + 1}: ${line.trim()}`);
      }
    }

    return {evidence, suppressed};
  }

  /**
   * Like {@link extractMatchSnippets} but joins indented continuation lines
   * (YAML/kubectl-describe multi-line values) into a single evidence entry.
   *
   * When a matching key line is found, any immediately following lines whose
   * leading whitespace is strictly greater than the key line's indentation are
   * appended (space-separated) before the snippet is recorded.  This collapses
   * a multi-line `message:` value into one readable line instead of surfacing
   * only the truncated first line.
   */
  private extractMatchSnippetsJoiningContinuations(content: string, pattern: RegExp, maxMatches: number): string[] {
    const snippets: string[] = [];
    const lines: string[] = content.split(/\r?\n/);
    const normalizedFlags: string = pattern.flags.includes('g') ? pattern.flags.replaceAll('g', '') : pattern.flags;
    const matcher: RegExp = new RegExp(pattern.source, normalizedFlags);

    for (let index: number = 0; index < lines.length && snippets.length < maxMatches; index++) {
      const line: string = lines[index];
      if (!matcher.test(line)) {
        continue;
      }

      const keyIndent: number = (line.match(/^(\s*)/)?.[1] ?? '').length;
      let joined: string = line.trim();

      // Absorb continuation lines that are indented more than the key line.
      let next: number = index + 1;
      while (next < lines.length) {
        const nextLine: string = lines[next];
        if (nextLine.trim().length === 0) {
          break;
        }
        const nextIndent: number = (nextLine.match(/^(\s*)/)?.[1] ?? '').length;
        if (nextIndent <= keyIndent) {
          break;
        }
        joined += ' ' + nextLine.trim();
        next++;
      }

      snippets.push(`line ${index + 1}: ${joined}`);
    }

    return snippets;
  }

  /**
   * Extracts up to `maxBlocks` exception/stack-trace blocks from `content`.
   *
   * A block starts on any line matching `Exception`, `Error`, or `Caused by:`
   * and continues as long as subsequent lines are stack frames (`at …`),
   * chained causes (`Caused by:`), or truncation markers (`… N more`).
   * Each block is capped at `maxLinesPerBlock` lines.
   */
  private extractExceptionBlocks(content: string, maxBlocks: number, maxLinesPerBlock: number): string[] {
    const lines: string[] = content.split(/\r?\n/);
    const blocks: string[] = [];
    const timestampPattern: RegExp = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;
    const exceptionTypeLinePattern: RegExp =
      /^\s*(?:[a-z_][A-Za-z0-9_$]*\.)*[A-Z][A-Za-z0-9_$]*(?:Exception|Error|Throwable)(?::|\b)/;
    const startPattern: RegExp = new RegExp(
      String.raw`${exceptionTypeLinePattern.source}|\b(?:Exception|Error)\b|^\s*Caused by:`,
    );

    // Matches only the severity levels that indicate a real error.
    const errorLevelPattern: RegExp = /\b(?:ERROR|FATAL|SEVERE)\b/i;

    for (let index: number = 0; index < lines.length && blocks.length < maxBlocks; index++) {
      if (!startPattern.test(lines[index])) {
        continue;
      }

      // Look back up to 5 lines to find the nearest timestamped log line and
      // determine its severity.  Stack traces following a WARN/INFO/DEBUG line
      // are expected (e.g. FileAlreadyExistsException on a WARN archive attempt)
      // and must not be reported as findings.
      let precedingIsError: boolean = false;
      let precedingLogLine: string = '';
      for (let scan: number = index - 1; scan >= 0 && scan >= index - 5; scan--) {
        if (timestampPattern.test(lines[scan])) {
          precedingLogLine = lines[scan];
          precedingIsError = errorLevelPattern.test(lines[scan]);
          break;
        }
      }
      // If the nearest timestamped line exists and is not an error level, skip.
      if (precedingLogLine && !precedingIsError) {
        continue;
      }

      const blockLines: string[] = [lines[index]];
      // In swirlds/hgcaa logs, the actual throwable class line can follow a
      // timestamped ERROR marker line. Include that marker line as context.
      if (
        index > 0 &&
        blockLines.length < maxLinesPerBlock &&
        (/\bERROR\s+EXCEPTION\b/i.test(lines[index - 1]) ||
          (timestampPattern.test(lines[index - 1]) && errorLevelPattern.test(lines[index - 1]))) &&
        !blockLines.includes(lines[index - 1])
      ) {
        blockLines.unshift(lines[index - 1]);
      }

      let next: number = index + 1;
      while (next < lines.length && blockLines.length < maxLinesPerBlock) {
        const line: string = lines[next];
        if (line.trim().length === 0 || timestampPattern.test(line)) {
          break;
        }
        if (
          /^\s+at\s+/.test(line) ||
          /^\s*Caused by:/.test(line) ||
          /^\s*Suppressed:/.test(line) ||
          /^\s*\.\.\.\s+\d+\s+more/.test(line) ||
          exceptionTypeLinePattern.test(line)
        ) {
          blockLines.push(line);
          next++;
          continue;
        }
        break;
      }

      blocks.push(blockLines.join('\n'));
      index = next - 1;
    }

    return blocks;
  }

  /**
   * Renders all findings into a human-readable plain-text report, sorted by
   * severity (image-pull → oom → pod-readiness → consensus-active →
   * log-exception).  Returns the report as a string ready to be written to
   * `diagnostics-analysis.txt`.
   */
  /**
   * Returns `findings` ordered most severe first, preserving discovery order within a category.
   *
   * Shared by the report and the terminal summary. The summary previously iterated the unordered
   * array, so which findings made its ten-item cut depended on the order the scanners happened to
   * run in — a block node dead of heap exhaustion was pushed past the cut by routine consensus-node
   * exceptions and never shown, even though the report ranked it correctly.
   */
  private static orderFindingsBySeverity(findings: readonly DiagnosticsFinding[]): DiagnosticsFinding[] {
    // Sorts a copy, so the caller's array is untouched; `toSorted` is ES2023 and this project
    // targets ES2022. Matches the existing pattern used elsewhere in src/.
    // eslint-disable-next-line unicorn/no-array-sort
    return [...findings].sort(
      (first: DiagnosticsFinding, second: DiagnosticsFinding): number =>
        DiagnosticsAnalyzer.CATEGORY_SEVERITY_ORDER[first.category] -
        DiagnosticsAnalyzer.CATEGORY_SEVERITY_ORDER[second.category],
    );
  }

  private renderDiagnosticsFindings(findings: DiagnosticsFinding[]): string {
    const categoryLabel: Record<DiagnosticsFindingCategory, string> = {
      'image-pull': 'Image Pull',
      oom: 'Out Of Memory',
      'pod-readiness': 'Pod Readiness',
      'consensus-active': 'Consensus Active State',
      'log-exception': 'Exception Stack',
      'app-error': 'Application Error',
    };

    const lines: string[] = ['Solo Diagnostics Analysis Report', `Generated: ${new Date().toISOString()}`, ''];

    if (findings.length === 0) {
      lines.push('No common failure signatures were detected.');
      return lines.join('\n');
    }

    const orderedFindings: DiagnosticsFinding[] = DiagnosticsAnalyzer.orderFindingsBySeverity(findings);

    lines.push(`Detected ${orderedFindings.length} potential issue(s):`, '');

    for (const [index, finding] of orderedFindings.entries()) {
      lines.push(`${index + 1}. [${categoryLabel[finding.category]}] ${finding.title}`, `   Source: ${finding.source}`);
      if (finding.evidence.length > 0) {
        lines.push('   Evidence:');
        for (const evidenceLine of finding.evidence) {
          lines.push(`   - ${evidenceLine}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
