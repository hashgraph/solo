// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import sinon from 'sinon';

import {DiagnosticsAnalyzer} from '../../../../src/commands/util/diagnostics-analyzer.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';

describe('DiagnosticsAnalyzer', (): void => {
  let temporaryDirectory: string;
  let loggerStub: SoloLogger;
  let userMessages: string[];

  const swirldsLogSample: string = `2026-03-27 16:52:37.460 20       INFO  STARTUP          <main> EnhancedKeyStoreLoader: Finished key store migration.
2026-03-27 16:52:37.481 21       INFO  STARTUP          <main> EnhancedKeyStoreLoader: Generating agreement key pair for local nodeId 2
2026-03-27 16:52:37.539 22       WARN  STARTUP          <main> EnhancedKeyStoreLoader: No certificate found for nodeId 2 [purpose = AGREEMENT ]
2026-03-27 16:52:37.539 23       ERROR EXCEPTION        <main> CryptoStatic: Exception while loading/generating keys
com.swirlds.platform.crypto.KeyLoadingException: No certificate found for nodeId 2 [purpose = AGREEMENT ]
\tat com.swirlds.platform.crypto.EnhancedKeyStoreLoader.verify(EnhancedKeyStoreLoader.java:341)
\tat com.swirlds.platform.crypto.CryptoStatic.initNodeSecurity(CryptoStatic.java:186)
\tat com.hedera.node.app.ServicesMain.main(ServicesMain.java:228)
2026-03-27 16:52:37.541 24       INFO  STARTUP          <main> SystemExitUtils: System exit requested (KEY_LOADING_FAILED)
thread requesting exit: main
com.swirlds.platform.system.SystemExitUtils.exitSystem(SystemExitUtils.java:37)
\tat com.swirlds.platform.system.SystemExitUtils.exitSystem(SystemExitUtils.java:73)
\tat com.swirlds.platform.crypto.CryptoStatic.initNodeSecurity(CryptoStatic.java:216)
\tat com.hedera.node.app.ServicesMain.main(ServicesMain.java:228)

2026-03-27 16:52:37.544 25       ERROR EXCEPTION        <main> SystemExitUtils: Exiting system {"reason":"KEY_LOADING_FAILED","code":204} [com.swirlds.logging.legacy.payload.SystemExitPayload]
2026-03-27 16:52:37.544 26       INFO  STARTUP          <<browser: shutdown-hook>> Log4jSetup: JVM is shutting down.
`;

  beforeEach((): void => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'solo-diagnostics-analyzer-'));
    userMessages = [];
    loggerStub = {
      setDevMode: sinon.stub(),
      isDevMode: sinon.stub().returns(false),
      nextTraceId: sinon.stub(),
      prepMeta: sinon.stub().callsFake((meta?: object): object => meta ?? {}),
      showUser: sinon.stub().callsFake((message: unknown): void => {
        userMessages.push(String(message));
      }),
      showUserUnlessOneShot: sinon.stub(),
      beginDeferredUserOutput: sinon.stub(),
      flushDeferredUserOutput: sinon.stub(),
      showUserError: sinon.stub(),
      error: sinon.stub(),
      warn: sinon.stub(),
      info: sinon.stub(),
      debug: sinon.stub(),
      showList: sinon.stub(),
      showListIfNotEmpty: sinon.stub(),
      showJSON: sinon.stub(),
      addMessageGroup: sinon.stub(),
      getMessageGroup: sinon.stub().returns([]),
      addMessageGroupMessage: sinon.stub(),
      showMessageGroup: sinon.stub(),
      getMessageGroupKeys: sinon.stub().returns([]),
      showAllMessageGroups: sinon.stub(),
      flush: sinon.stub().callsFake((callback: (error?: Error) => void): void => callback()),
      setLogBinding: sinon.stub(),
      addLogBindings: sinon.stub(),
      clearLogBindings: sinon.stub(),
    };
  });

  afterEach((): void => {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
    sinon.restore();
  });

  it('extracts and reports exception stack details from swirlds.log', (): void => {
    const archivePath: string = path.join(temporaryDirectory, 'network-node3-0-log-config.zip');
    const archive: AdmZip = new AdmZip();
    archive.addFile('output/swirlds.log', Buffer.from(swirldsLogSample, 'utf8'));
    archive.writeZip(archivePath);

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    expect(fs.existsSync(reportPath)).to.equal(true);

    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Consensus node may not have reached ACTIVE status');
    expect(reportText).to.include('Exception detected in swirlds.log');
    expect(reportText).to.include(
      'com.swirlds.platform.crypto.KeyLoadingException: No certificate found for nodeId 2 [purpose = AGREEMENT ]',
    );
    expect(reportText).to.include(
      'at com.swirlds.platform.crypto.EnhancedKeyStoreLoader.verify(EnhancedKeyStoreLoader.java:341)',
    );
    expect(reportText).to.include('No ACTIVE status marker found in swirlds.log');

    const consoleSummary: string = userMessages.join('\n');
    expect(consoleSummary).to.include('Exception detected in swirlds.log');
    expect(consoleSummary).to.include(
      'com.swirlds.platform.crypto.KeyLoadingException: No certificate found for nodeId 2 [purpose = AGREEMENT ]',
    );
  });

  it('includes the preceding ERROR EXCEPTION line when exception block starts on throwable class line', (): void => {
    const logWithUppercaseExceptionMarker: string = `2026-03-27 16:52:37.539 23       ERROR EXCEPTION        <main> CryptoStatic: key loading failed
com.swirlds.platform.crypto.KeyLoadingException: No certificate found for nodeId 2 [purpose = AGREEMENT ]
\tat com.swirlds.platform.crypto.EnhancedKeyStoreLoader.verify(EnhancedKeyStoreLoader.java:341)
2026-03-27 16:52:37.541 24       INFO  STARTUP          <main> SystemExitUtils: System exit requested (KEY_LOADING_FAILED)
`;

    const archivePath: string = path.join(temporaryDirectory, 'network-node3-0-log-config.zip');
    const archive: AdmZip = new AdmZip();
    archive.addFile('output/swirlds.log', Buffer.from(logWithUppercaseExceptionMarker, 'utf8'));
    archive.writeZip(archivePath);

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('ERROR EXCEPTION        <main> CryptoStatic: key loading failed');
    expect(reportText).to.include(
      'com.swirlds.platform.crypto.KeyLoadingException: No certificate found for nodeId 2 [purpose = AGREEMENT ]',
    );
  });

  it('includes the preceding timestamped ERROR line for hgcaa.log exceptions', (): void => {
    const hgcaaSample: string = `2026-03-27 16:46:55.329 INFO  401  WrapsHistoryProver - Considering publication of WRAPS R1 output on construction #2
2026-03-27 16:46:55.330 ERROR 351  HandleWorkflow - Possibly CATASTROPHIC failure trying to reconcile TSS state
java.lang.NullPointerException
\tat java.base/java.util.Objects.requireNonNull(Objects.java:220)
\tat com.hedera.node.app.history.impl.WrapsHistoryProver.publishIfNeeded(WrapsHistoryProver.java:407)
2026-03-27 16:46:55.390 INFO  401  WrapsHistoryProver - Considering publication of WRAPS R1 output on construction #2
`;

    const archivePath: string = path.join(temporaryDirectory, 'network-node2-0-log-config.zip');
    const archive: AdmZip = new AdmZip();
    archive.addFile('output/hgcaa.log', Buffer.from(hgcaaSample, 'utf8'));
    archive.writeZip(archivePath);

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Exception detected in hgcaa.log');
    expect(reportText).to.include(
      '2026-03-27 16:46:55.330 ERROR 351  HandleWorkflow - Possibly CATASTROPHIC failure trying to reconcile TSS state',
    );
    expect(reportText).to.include('java.lang.NullPointerException');
  });

  it('detects a memory-limit kill recorded as exit code 137 rather than OOMKilled', (): void => {
    // The kubelet frequently records a memory-limit kill as `exitCode: 137` (128 + SIGKILL) with
    // `reason: Error` and no OOMKilled anywhere. The pod is Running and Ready again by collection
    // time, so the readiness check does not flag it either.
    const describeSample: string = `pod:
  status:
    phase: Running
    containerStatuses:
      - name: block-node-server
        ready: true
        restartCount: 9
        lastState:
          terminated:
            exitCode: 137
            reason: Error
            finishedAt: 2026-08-27T16:03:36.000Z
        state:
          running:
            startedAt: 2026-08-27T16:03:36.000Z
events: []
`;

    const describeDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs', 'sphere-1');
    fs.mkdirSync(describeDirectory, {recursive: true});
    fs.writeFileSync(path.join(describeDirectory, 'block-node-1-0.describe.txt'), describeSample, 'utf8');

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('OOM-related failure detected for pod block-node-1-0');
    expect(reportText).to.include('exitCode: 137');
    // The restart count distinguishes a one-off kill from an ongoing loop.
    expect(reportText).to.include('restartCount: 9');
  });

  it('does not report an OOM for a container that exited non-zero for another reason', (): void => {
    const describeSample: string = `pod:
  status:
    phase: Running
    containerStatuses:
      - name: block-node-server
        ready: true
        restartCount: 2
        lastState:
          terminated:
            exitCode: 1
            reason: Error
events: []
`;

    const describeDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs', 'sphere-1');
    fs.mkdirSync(describeDirectory, {recursive: true});
    fs.writeFileSync(path.join(describeDirectory, 'block-node-1-0.describe.txt'), describeSample, 'utf8');

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.not.include('OOM-related failure');
  });

  it('detects JVM heap exhaustion in a log that carries no ERROR or FATAL level', (): void => {
    // The block node logs through java.util.logging (FINE/INFO/WARNING/SEVERE) and the JVM prints
    // heap exhaustion with no level at all, so nothing in this log matches ERROR or FATAL.
    // "OutOfMemoryError" has no word boundary before "Error", so \bERROR\b does not match it.
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    fs.writeFileSync(
      path.join(componentLogDirectory, 'block-node-1-0-1.log'),
      [
        '2026-08-27T15:58:09.147755355Z 2026-08-27 15:58:09.050+0000 FINE    [org.hiero.block.node.stream.publisher.LiveStreamPublisherManager addHandler] Added new handler 147',
        '2026-08-27T16:01:06.672252440Z java.lang.OutOfMemoryError: Java heap space',
        '2026-08-27T16:01:06.672777238Z Dumping heap to /tmp/dump.hprof ...',
        '2026-08-27T16:01:18.738172420Z Exception in thread "server-@default-listener" java.lang.OutOfMemoryError: Java heap space',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    // Reported as an out-of-memory death, not a routine app-error, so it ranks with the other
    // memory kills instead of last.
    expect(reportText).to.include('JVM heap exhaustion detected in pod log: block-node-1-0-1');
    expect(reportText).to.include('[Out Of Memory]');
    expect(reportText).to.include('line 2: ');
    expect(reportText).to.include('line 4: ');
  });

  it('matches Exception only as a standalone word, skipping class-name suffixes and prose', (): void => {
    // `Exception` is matched as its own word and case-sensitively. `SocketWriterException` is
    // low-level connection churn a server logs routinely and must not raise a finding: there is no
    // word boundary before "Exception" in a class-name suffix. Lowercase prose must not match either.
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    fs.writeFileSync(
      path.join(componentLogDirectory, 'blocknode-0.log'),
      [
        '2026-08-27T16:01:22.515Z 2026-08-27 16:01:22.515+0000 INFO    [PbjProtocolHandler init] Failed to initialize grpc protocol handler',
        '2026-08-27T16:01:22.580687714Z io.helidon.common.socket.SocketWriterException',
        '2026-08-27T16:01:22.580754160Z \tat io.helidon.common.socket.SocketWriterAsync.flush(SocketWriterAsync.java:179)',
        '2026-08-27T16:01:22.580786976Z Caused by: java.net.SocketException: Broken pipe',
        '2026-08-27T16:02:00.000Z 2026-08-27 16:02:00.000+0000 INFO    [Startup] Configured exception handling for the request pipeline',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.not.include('blocknode-0');
    expect(reportText).to.not.include('SocketWriterException');
  });

  it('shows the most severe findings in the terminal summary regardless of discovery order', (): void => {
    // The terminal summary prints only the first ten findings. It used to iterate the *unordered*
    // array, so which findings made the cut depended on the order the scanners ran in: describe
    // files are scanned before pod logs, so ten not-ready pods (severity 3) crowded out a heap
    // exhaustion (severity 2) found later, even though the report file ranked it above them.
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});

    for (let index: number = 0; index < 10; index++) {
      fs.writeFileSync(
        path.join(componentLogDirectory, `mirror-${index}-rest.describe.txt`),
        ['pod:', '  status:', '    phase: Pending', 'events: []', ''].join('\n'),
        'utf8',
      );
    }
    fs.writeFileSync(
      path.join(componentLogDirectory, 'block-node-1-0-1.log'),
      '2026-08-27T16:01:06.672252440Z java.lang.OutOfMemoryError: Java heap space',
      'utf8',
    );

    const userMessages: string[] = [];
    const capturingLogger: SoloLogger = {
      showUser: (message: string): void => {
        userMessages.push(message);
      },
      debug: (): void => {},
    } as unknown as SoloLogger;

    new DiagnosticsAnalyzer(capturingLogger).analyze(temporaryDirectory, '');

    const summary: string = userMessages.join('\n');
    // Present at all, and ahead of the lower-severity readiness findings.
    expect(summary).to.include('JVM heap exhaustion detected in pod log: block-node-1-0-1');
    expect(summary.indexOf('JVM heap exhaustion')).to.be.lessThan(summary.indexOf('Pod not ready/running'));
  });

  it('detects image-pull failures from YAML pod describe content', (): void => {
    const describeSample: string = `pod:
  status:
    phase: Running
events:
  - lastTimestamp: 2026-03-27T17:10:35.000Z
    message: 'Failed to pull image "curlimages/curl:8.9.1": failed to pull and
      unpack image "docker.io/curlimages/curl:8.9.1": failed to copy:
      httpReadSeeker: failed open: unexpected status code
      https://registry-1.docker.io/v2/curlimages/curl/manifests/sha256:78c8580bd9480f0d2527c0b781eeb9ffa00f3795f882e625f576aa51af8f4ad5:
      429 Too Many Requests - Server message: toomanyrequests: You have reached
      your unauthenticated pull rate limit.
      https://www.docker.com/increase-rate-limit'
    reason: Failed
  - lastTimestamp: 2026-03-27T17:12:57.000Z
    message: "Error: ErrImagePull"
    reason: Failed
  - lastTimestamp: 2026-03-27T17:24:58.000Z
    message: "Error: ImagePullBackOff"
    reason: Failed
`;

    const describeDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs', 'kind-solo-e2e');
    fs.mkdirSync(describeDirectory, {recursive: true});
    fs.writeFileSync(path.join(describeDirectory, 'network-node1-0.describe.txt'), describeSample, 'utf8');

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Image pull failure detected for pod network-node1-0');
    expect(reportText).to.include('line 10: 429 Too Many Requests - Server message: toomanyrequests: You have reached');
    expect(reportText).to.include('message: "Error: ErrImagePull"');
    expect(reportText).to.include('message: "Error: ImagePullBackOff"');
    expect(reportText).to.not.include('Pod not ready/running: network-node1-0');
  });

  it('includes container termination exit codes in pod readiness findings', (): void => {
    const describeSample: string = `pod:
  status:
    phase: Running
    conditions:
      - message: "containers with unready status: [relay]"
        reason: ContainersNotReady
        status: "False"
        type: ContainersReady
    containerStatuses:
      - lastState:
          terminated:
            exitCode: 137
            reason: Error
        name: relay
        ready: false
        state:
          running:
            startedAt: 2026-06-25T07:42:53.000Z
containers:
  relay:
    Last State: Terminated
      Reason: Error
      Exit Code: 137
    Ready: False
`;

    const describeDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs', 'kind-solo-e2e');
    fs.mkdirSync(describeDirectory, {recursive: true});
    fs.writeFileSync(path.join(describeDirectory, 'relay-1.describe.txt'), describeSample, 'utf8');

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Pod not ready/running: relay-1');
    expect(reportText).to.include('line 12: exitCode: 137');
    expect(reportText).to.include('line 23: Exit Code: 137');
    expect(reportText).to.include('line 13: reason: Error');

    const consoleSummary: string = userMessages.join('\n');
    expect(consoleSummary).to.include('line 12: exitCode: 137');
    expect(consoleSummary).to.include('line 23: Exit Code: 137');
  });

  it('suppresses known transient postgres migration race errors but keeps other errors', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const postgresLogPath: string = path.join(componentLogDirectory, 'solo-shared-resources-postgres-main.log');
    fs.writeFileSync(
      postgresLogPath,
      [
        '2026-03-27T16:52:37.539Z 2026-03-27T16:52:37.539Z ERROR relation "account_balance_temp" does not exist',
        '2026-03-27T16:52:38.539Z 2026-03-27T16:52:38.539Z ERROR unrecoverable postgres failure',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: solo-shared-resources-postgres-main');
    expect(reportText).to.include('ERROR unrecoverable postgres failure');
    expect(reportText).to.not.include('relation "account_balance_temp" does not exist');
  });

  it('suppresses mirror importer begin-phase downloader errors only after repeated parse success', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const importerLogPath: string = path.join(componentLogDirectory, 'mirror-main-importer.log');
    fs.writeFileSync(
      importerLogPath,
      [
        '2026-03-27T16:52:00.000Z 2026-03-27T16:52:00.000Z ERROR RecordFileDownloader Error downloading files',
        '2026-03-27T16:52:01.000Z 2026-03-27T16:52:01.000Z INFO RecordFileParser Successfully processed 1 items',
        '2026-03-27T16:52:02.000Z 2026-03-27T16:52:02.000Z ERROR AccountBalancesDownloader Error downloading signature files for node 0',
        '2026-03-27T16:52:03.000Z 2026-03-27T16:52:03.000Z INFO RecordFileParser Successfully processed 1 items',
        '2026-03-27T16:52:04.000Z 2026-03-27T16:52:04.000Z ERROR RecordFileDownloader Error downloading files',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: mirror-main-importer');
    expect(reportText).to.include(
      'line 5: 2026-03-27T16:52:04.000Z ERROR RecordFileDownloader Error downloading files',
    );
    expect(reportText).to.not.include(
      'line 1: 2026-03-27T16:52:00.000Z ERROR RecordFileDownloader Error downloading files',
    );
    expect(reportText).to.not.include(
      'line 3: 2026-03-27T16:52:02.000Z ERROR AccountBalancesDownloader Error downloading signature files for node 0',
    );
  });

  it('suppresses mirror importer begin-phase block-node source errors only after repeated parse success', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const importerLogPath: string = path.join(componentLogDirectory, 'mirror-main-importer.log');
    fs.writeFileSync(
      importerLogPath,
      [
        '2026-05-19T17:08:39.170Z 2026-05-19T17:08:39.170Z ERROR scheduling-6 o.h.m.i.d.b.BlockNode Failed to get server status for BlockNode(block-node-1.one-shot.svc.cluster.local:40840) io.grpc.StatusRuntimeException: UNAVAILABLE: io exception',
        '2026-05-19T17:08:39.170Z 2026-05-19T17:08:39.170Z ERROR scheduling-6 o.h.m.i.d.b.CompositeBlockSource Failed to get block from BLOCK_NODE source: No block node can provide block 0',
        '2026-05-19T17:08:40.170Z 2026-05-19T17:08:40.170Z INFO RecordFileParser Successfully processed 1 items',
        '2026-05-19T17:08:41.170Z 2026-05-19T17:08:41.170Z INFO RecordFileParser Successfully processed 1 items',
        '2026-05-19T17:08:42.170Z 2026-05-19T17:08:42.170Z ERROR scheduling-6 o.h.m.i.d.b.BlockNode Failed to get server status for BlockNode(block-node-1.one-shot.svc.cluster.local:40840) io.grpc.StatusRuntimeException: UNAVAILABLE: io exception',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: mirror-main-importer');
    expect(reportText).to.include(
      'line 5: 2026-05-19T17:08:42.170Z ERROR scheduling-6 o.h.m.i.d.b.BlockNode Failed to get server status for BlockNode(block-node-1.one-shot.svc.cluster.local:40840) io.grpc.StatusRuntimeException: UNAVAILABLE: io exception',
    );
    expect(reportText).to.not.include(
      'line 1: 2026-05-19T17:08:39.170Z ERROR scheduling-6 o.h.m.i.d.b.BlockNode Failed to get server status for BlockNode(block-node-1.one-shot.svc.cluster.local:40840) io.grpc.StatusRuntimeException: UNAVAILABLE: io exception',
    );
    expect(reportText).to.not.include(
      'line 2: 2026-05-19T17:08:39.170Z ERROR scheduling-6 o.h.m.i.d.b.CompositeBlockSource Failed to get block from BLOCK_NODE source: No block node can provide block 0',
    );
  });

  it('suppresses conditional mirror rest retry errors when success marker exists', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const restLogPath: string = path.join(componentLogDirectory, 'mirror-main-rest.log');
    fs.writeFileSync(
      restLogPath,
      [
        '2026-03-27T16:52:00.000Z 2026-03-27T16:52:00.000Z ERROR Startup Error connecting to redis://redis:6379',
        '2026-03-27T16:52:05.000Z 2026-03-27T16:52:05.000Z INFO Startup Connected to redis://redis:6379',
        '2026-03-27T16:52:10.000Z 2026-03-27T16:52:10.000Z ERROR unrelated rest failure',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: mirror-main-rest');
    expect(reportText).to.include('ERROR unrelated rest failure');
    expect(reportText).to.not.include('ERROR Startup Error connecting to redis://redis:6379');
  });

  it('suppresses mirror rest db auth failures only during startup', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const restLogPath: string = path.join(componentLogDirectory, 'mirror-1-rest-7447d9dd48-fzz6t.log');
    fs.writeFileSync(
      restLogPath,
      [
        '2026-05-16T20:04:01.696Z 2026-05-16T20:04:01.696Z INFO Startup Loaded configuration source: /home/node/app/config/application.yml',
        '2026-05-16T20:04:03.795Z 2026-05-16T20:04:03.795Z ERROR Startup Error connecting to redis://redis:6379: connect ECONNREFUSED 10.96.225.68:6379',
        '2026-05-16T20:04:03.912Z 2026-05-16T20:04:03.912Z ERROR Startup healthcheck failed DbError: password authentication failed for user "mirror_rest"',
        '2026-05-16T20:04:03.912Z     at file:///home/node/app/health.js:26:13',
        '2026-05-16T20:04:09.801Z 2026-05-16T20:04:09.801Z INFO Startup Connected to redis://redis:6379',
        '2026-05-16T20:04:13.909Z 2026-05-16T20:04:13.909Z ERROR Startup healthcheck failed NotFoundError: Application readiness check failed',
        '2026-05-16T20:05:10.000Z 2026-05-16T20:05:10.000Z ERROR Startup healthcheck failed DbError: password authentication failed for user "mirror_rest"',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: mirror-1-rest-7447d9dd48-fzz6t');
    expect(reportText).to.include(
      'line 7: 2026-05-16T20:05:10.000Z ERROR Startup healthcheck failed DbError: password authentication failed for user "mirror_rest"',
    );
    expect(reportText).to.not.include(
      'line 6: 2026-05-16T20:04:13.909Z ERROR Startup healthcheck failed NotFoundError: Application readiness check failed',
    );
    expect(reportText).to.not.include(
      'line 3: 2026-05-16T20:04:03.912Z ERROR Startup healthcheck failed DbError: password authentication failed for user "mirror_rest"',
    );
  });

  it('suppresses split mirror rest readiness failures only during startup', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const restLogPath: string = path.join(componentLogDirectory, 'mirror-1-rest-68c654f85d-xbkw8-1.log');
    fs.writeFileSync(
      restLogPath,
      [
        '2026-06-29T07:59:03.482Z 2026-06-29T07:59:02.854Z INFO Startup Loaded configuration source: /home/node/app/config/application.yml',
        '2026-06-29T07:59:05.486Z 2026-06-29T07:59:05.479Z ERROR Startup healthcheck failed',
        'Error: Application readiness check failed',
        '    at file:///home/node/app/server.js:778:1872',
        '    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)',
        '2026-06-29T08:02:05.486Z 2026-06-29T08:02:05.479Z ERROR Startup healthcheck failed',
        'Error: Application readiness check failed',
        '    at file:///home/node/app/server.js:778:1872',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: mirror-1-rest-68c654f85d-xbkw8-1');
    expect(reportText).to.include('line 6: 2026-06-29T08:02:05.479Z ERROR Startup healthcheck failed');
    expect(reportText).to.not.include('line 2: 2026-06-29T07:59:05.479Z ERROR Startup healthcheck failed');
  });

  it('suppresses bare mirror rest healthcheck failures only during startup', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const restLogPath: string = path.join(componentLogDirectory, 'mirror-1-rest-67c8d766f9-zls4k.log');
    fs.writeFileSync(
      restLogPath,
      [
        '2026-08-02T23:02:45.000Z 2026-08-02T23:02:45.000Z INFO Startup Loaded configuration source: /home/node/app/config/application.yml',
        '2026-08-02T23:02:48.034834922Z 2026-08-02T23:02:47.871Z ERROR Startup healthcheck failed',
        '2026-08-02T23:02:48.034846047Z Error: connect ECONNREFUSED 10.96.184.220:5432',
        '2026-08-02T23:05:46.000Z 2026-08-02T23:05:46.000Z ERROR Startup healthcheck failed',
        '2026-08-02T23:05:46.001Z Error: connect ECONNREFUSED 10.96.184.220:5432',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: mirror-1-rest-67c8d766f9-zls4k');
    expect(reportText).to.include('line 4: 2026-08-02T23:05:46.000Z ERROR Startup healthcheck failed');
    expect(reportText).to.not.include('line 2: 2026-08-02T23:02:47.871Z ERROR Startup healthcheck failed');
  });

  it('suppresses split mirror rest db auth failures only during startup', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const restLogPath: string = path.join(componentLogDirectory, 'mirror-1-rest-68c654f85d-zlr9q.log');
    fs.writeFileSync(
      restLogPath,
      [
        '2026-06-28T03:30:43.350Z 2026-06-28T03:30:42.737Z INFO Startup Loaded configuration source: /home/node/app/config/application.yml',
        '2026-06-28T03:30:44.102Z 2026-06-28T03:30:43.939Z ERROR Startup healthcheck failed',
        'Error: password authentication failed for user "mirror_rest"',
        '    at file:///home/node/app/server.js:778:1819',
        '2026-06-28T03:31:45.103Z 2026-06-28T03:31:44.933Z ERROR Startup healthcheck failed',
        'Error: password authentication failed for user "mirror_rest"',
        '    at file:///home/node/app/server.js:778:1819',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: mirror-1-rest-68c654f85d-zlr9q');
    expect(reportText).to.include('line 5: 2026-06-28T03:31:44.933Z ERROR Startup healthcheck failed');
    expect(reportText).to.not.include('line 2: 2026-06-28T03:30:43.939Z ERROR Startup healthcheck failed');
  });

  it('keeps non-suppressed continuation-line error matches as evidence', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const relayLogPath: string = path.join(componentLogDirectory, 'relay-main.log');
    fs.writeFileSync(
      relayLogPath,
      [
        '2026-03-27T16:52:00.000Z ERROR relay startup failed',
        '  java.lang.RuntimeException: root cause',
        '  Caused by: nested ERROR detail',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('line 1: ERROR relay startup failed');
    expect(reportText).to.include('line 3: Caused by: nested ERROR detail');
  });

  it('suppresses postgres authentication failures only within startup window', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const postgresLogPath: string = path.join(componentLogDirectory, 'solo-shared-resources-postgres-0.log');
    fs.writeFileSync(
      postgresLogPath,
      [
        '2026-05-16T20:03:43.159Z 2026-05-16 20:03:43.159 GMT [1] LOG:  pgaudit extension initialized',
        '2026-05-16T20:03:43.185Z 2026-05-16 20:03:43.185 GMT [1] LOG:  database system is ready to accept connections',
        '2026-05-16T20:04:03.911Z 2026-05-16 20:04:03.911 GMT [245] FATAL:  password authentication failed for user "mirror_rest"',
        '2026-05-16T20:04:03.911Z 2026-05-16 20:04:03.911 GMT [245] DETAIL:  Role "mirror_rest" does not exist.',
        '2026-05-16T20:04:04.906Z 2026-05-16 20:04:04.906 GMT [246] FATAL:  password authentication failed for user "mirror_rest"',
        '2026-05-16T20:04:04.906Z 2026-05-16 20:04:04.906 GMT [246] DETAIL:  Role "mirror_rest" does not exist.',
        '2026-05-16T20:04:12.906Z 2026-05-16 20:04:12.906 GMT [271] FATAL:  password authentication failed for user "mirror_rest"',
        '2026-05-16T20:04:12.906Z 2026-05-16 20:04:12.906 GMT [271] DETAIL:  Role "mirror_rest" does not exist.',
        '2026-05-16T20:04:24.616Z 2026-05-16 20:04:24.616 GMT [260] ERROR:  relation "crypto_allowance_migration" does not exist at character 8',
        '2026-05-16T20:05:20.616Z 2026-05-16 20:05:20.616 GMT [260] ERROR:  deadlock detected',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('Application ERROR detected in pod log: solo-shared-resources-postgres-0');
    expect(reportText).to.include('ERROR:  deadlock detected');
    expect(reportText).to.not.include('ERROR:  relation "crypto_allowance_migration" does not exist');
    // Auth failures within 90-second startup window should be suppressed
    expect(reportText).to.not.include('FATAL:  password authentication failed');
  });

  it('suppresses importer block-node read errors only when a later block success follows', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const importerLogPath: string = path.join(componentLogDirectory, 'mirror-main-importer.log');
    fs.writeFileSync(
      importerLogPath,
      [
        // Recovered: an HTTP/2 GOAWAY, a not-yet-available block, and a misaligned first block item,
        // all followed by further successful block processing.
        '2026-08-27T16:49:10.505Z 2026-08-27T16:49:10.505Z ERROR scheduling-4 o.h.m.i.d.b.BlockNode Failed to get server status detail for BlockNode(block-node-1.one-shot.svc.cluster.local:40840) io.grpc.StatusRuntimeException: INTERNAL: Abrupt GOAWAY closed sent stream. HTTP/2 error code: PROTOCOL_ERROR',
        '2026-08-27T16:49:10.506Z 2026-08-27T16:49:10.506Z ERROR scheduling-4 o.h.m.i.d.b.CompositeBlockSource Failed to get block from BLOCK_NODE source: No block node can provide block 14',
        '2026-08-27T16:49:11.000Z 2026-08-27T16:49:11.000Z ERROR scheduling-4 o.h.m.i.d.b.CompositeBlockSource Failed to get block from BLOCK_NODE source org.hiero.mirror.importer.exception.BlockStreamException: Incorrect first block item case ROUND_HEADER',
        '2026-08-27T16:49:12.000Z 2026-08-27T16:49:12.000Z INFO pool-10-thread-2 o.h.m.i.p.r.RecordFileParser Successfully processed 1 items from 0000000000000000014.blk in 1.1 ms',
        '2026-08-27T16:49:13.000Z 2026-08-27T16:49:13.000Z INFO pool-10-thread-2 o.h.m.i.p.r.RecordFileParser Successfully processed 1 items from 0000000000000000015.blk in 1.2 ms',
        // Terminal: no success follows, so this must stay visible.
        '2026-08-27T16:50:00.000Z 2026-08-27T16:50:00.000Z ERROR scheduling-4 o.h.m.i.d.b.CompositeBlockSource Failed to get block from BLOCK_NODE source: No block node can provide block 16',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.not.include('line 1: ');
    expect(reportText).to.not.include('line 2: ');
    expect(reportText).to.not.include('line 3: ');
    // A block-node failure with no subsequent progress is a real outage, not a retried blip.
    expect(reportText).to.include('line 6: ');
  });

  it('suppresses account balance downloader errors when no cloud storage is configured', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const importerLogPath: string = path.join(componentLogDirectory, 'mirror-main-importer.log');
    fs.writeFileSync(
      importerLogPath,
      [
        '2026-08-27T16:49:23.136Z 2026-08-27T16:49:23.136Z ERROR parallel-1 o.h.m.i.d.b.AccountBalancesDownloader Error downloading signature files for node 0 software.amazon.awssdk.core.exception.SdkClientException: Unable to load credentials from any of the providers in the chain AwsCredentialsProviderChain(credentialsProviders=[SystemPropertyCredentialsProvider()])',
        "2026-08-27T16:49:28.133Z 2026-08-27T16:49:28.133Z ERROR scheduling-4 o.h.m.i.d.b.AccountBalancesDownloader Error downloading files reactor.core.Exceptions$ReactiveException: java.util.concurrent.TimeoutException: Did not observe any item or terminal signal within 5000ms in 'flatMap' (and no fallback has been configured)",
        // An unrelated downloader failure must not be swept up by the cloud-storage rule.
        '2026-08-27T16:49:30.000Z 2026-08-27T16:49:30.000Z ERROR scheduling-4 o.h.m.i.d.b.AccountBalancesDownloader Error downloading files java.lang.IllegalStateException: corrupt balance file',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.not.include('line 1: ');
    expect(reportText).to.not.include('line 2: ');
    expect(reportText).to.include('line 3: ');
  });

  it('suppresses mirror web3 missing-table errors during startup', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const web3LogPath: string = path.join(componentLogDirectory, 'mirror-1-web3-6c6964dd4c-545hp.log');
    fs.writeFileSync(
      web3LogPath,
      [
        '2026-08-27T16:47:54.316Z 2026-08-27T16:47:54.316Z INFO main o.h.m.w.Web3Application Started Web3Application',
        '2026-08-27T16:47:54.808Z 2026-08-27T16:47:54.808Z WARN task-1 o.h.orm.jdbc.error ERROR: relation "file_data" does not exist',
        '2026-08-27T16:47:54.809Z 2026-08-27T16:47:54.809Z WARN task-1 o.h.orm.jdbc.error ERROR: relation "file_data" does not exist',
        '2026-08-27T16:58:00.000Z 2026-08-27T16:58:00.000Z WARN task-1 o.h.orm.jdbc.error ERROR: relation "file_data" does not exist',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.not.include('line 2: ');
    expect(reportText).to.not.include('line 3: ');
    // Long after startup a missing table is a real schema problem.
    expect(reportText).to.include('line 4: ');
  });

  it('suppresses mirror restjava missing-table errors only during startup', (): void => {
    const componentLogDirectory: string = path.join(temporaryDirectory, 'hiero-components-logs');
    fs.mkdirSync(componentLogDirectory, {recursive: true});
    const restJavaLogPath: string = path.join(componentLogDirectory, 'mirror-1-restjava-5bfc4c8679-sxbfw.log');
    fs.writeFileSync(
      restJavaLogPath,
      [
        '2026-08-27T15:36:33.663Z 2026-08-27T15:36:33.663Z INFO main o.h.m.r.RestJavaApplication Started RestJavaApplication in 4.522 seconds',
        '2026-08-27T15:36:33.664Z 2026-08-27T15:36:33.664Z WARN scheduling-1 o.h.orm.jdbc.error ERROR: relation "file_data" does not exist',
        '2026-08-27T15:36:33.664Z 2026-08-27T15:36:33.664Z ERROR scheduling-1 o.s.s.s.TaskUtils$LoggingErrorHandler Unexpected error occurred in scheduled task org.springframework.dao.InvalidDataAccessResourceUsageException: JDBC exception executing SQL [ERROR: relation "file_data" does not exist',
        '2026-08-27T15:36:33.665Z Caused by: org.postgresql.util.PSQLException: ERROR: relation "file_data" does not exist',
        '2026-08-27T15:45:00.000Z 2026-08-27T15:45:00.000Z ERROR scheduling-1 o.s.s.s.TaskUtils$LoggingErrorHandler Unexpected error occurred in scheduled task org.springframework.dao.InvalidDataAccessResourceUsageException: JDBC exception executing SQL [ERROR: relation "file_data" does not exist',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    // The startup-window entry and its cascaded "Caused by:" continuation are both suppressed.
    expect(reportText).to.not.include('line 2: ');
    expect(reportText).to.not.include('line 3: ');
    expect(reportText).to.not.include('line 4: ');
    // A missing table long after startup is a real schema problem.
    expect(reportText).to.include('line 5: ');
  });

  it('suppresses transient solo.log block-node copy verification size mismatch errors', (): void => {
    const soloLogPath: string = path.join(temporaryDirectory, 'solo.log');
    fs.writeFileSync(
      soloLogPath,
      [
        '[17:15:44.153] ERROR: Failed to download block node log files from block-node-1-0: SoloError: copy verification failed: expected size 3422030 but found 3429506 at /Users/jeffrey/.solo/logs/hiero-components-logs/kind-solo-cluster/block-node-1-0-block-logs/blocknode-0.log',
        '[17:15:44.200] INFO: continuing diagnostics collection',
        '[17:15:45.153] ERROR: real analyzer failure that must be reported',
      ].join('\n'),
      'utf8',
    );

    new DiagnosticsAnalyzer(loggerStub).analyze(temporaryDirectory, '');

    const reportPath: string = path.join(temporaryDirectory, 'diagnostics-analysis.txt');
    const reportText: string = fs.readFileSync(reportPath, 'utf8');
    expect(reportText).to.include('ERROR detected in solo.log');
    expect(reportText).to.include('line 3: [17:15:45.153] ERROR: real analyzer failure that must be reported');
    expect(reportText).to.not.include('copy verification failed: expected size 3422030 but found 3429506');

    const consoleSummary: string = userMessages.join('\n');
    expect(consoleSummary).to.include('Suppressed 1 transient error line(s) in solo.log');
  });
});
