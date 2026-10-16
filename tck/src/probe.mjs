// SPDX-License-Identifier: Apache-2.0
import {readFileSync, renameSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {Failure, EXIT, redact} from './contract.mjs';
import {command} from './process.mjs';

export function transactionPath(id) {
  return `/api/v1/transactions/${id.accountId}-${id.validStart.seconds}-${String(id.validStart.nanos).padStart(9, '0')}`;
}

export async function mirror(base, apiPath, check, timeout = 120_000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const response = await fetch(`${base}${apiPath}`, {
        signal: AbortSignal.timeout(Math.min(5000, Math.max(1, end - Date.now()))),
      });
      last = `HTTP ${response.status}`;
      if (response.ok && check(await response.json())) return;
    } catch (error) {
      last = error.message; /* Retry delayed mirror ingestion until the fixed deadline. */
    }
    await delay(Math.min(1000, Math.max(0, end - Date.now())));
  }
  throw new Failure('candidate', `Mirror did not confirm ${apiPath} within ${timeout}ms (${last})`);
}

export function transferMatches(body, transfer) {
  return body.transactions?.some(
    transaction =>
      transaction.result === 'SUCCESS' &&
      transaction.transfers?.some(item => item.account === '0.0.2' && item.amount === transfer.amount) &&
      transaction.transfers?.some(item => item.account === transfer.account && item.amount <= -transfer.amount),
  );
}

export function messageMatches(body, expected) {
  return (
    body.sequence_number?.toString() === expected.sequence &&
    Buffer.from(body.message || '', 'base64').toString('utf8') === expected.message
  );
}

export function recordLoadReceipt(load, index, value) {
  load.successful++;
  const name = index % 2 ? 'lastMessage' : 'lastTransfer';
  if (index > (load[`${name}Index`] ?? -1)) {
    load[name] = value;
    load[`${name}Index`] = index;
  }
}

export async function readbacks(base, transactions) {
  await Promise.all([
    mirror(base, transactions.transfer.path, body => transferMatches(body, transactions.transfer)),
    mirror(base, transactions.message.path, body => messageMatches(body, transactions.message)),
  ]);
}

async function worker(mode, directory) {
  const configuration = JSON.parse(readFileSync(path.join(directory, 'configuration.json'), 'utf8'));
  const sdk = await import(pathToFileURL(configuration.sdkEntry).href);
  const stateFile = path.join(directory, 'account.json');
  const evidenceFile = path.join(directory, 'probe-results.json');
  const evidence = mode === 'load' ? JSON.parse(readFileSync(evidenceFile, 'utf8')) : {probes: {}};
  let account;
  let key;
  let client;
  const save = () => {
    writeFileSync(`${evidenceFile}.tmp`, JSON.stringify(evidence, null, 2));
    renameSync(`${evidenceFile}.tmp`, evidenceFile);
  };
  const probe = async (id, operation) => {
    evidence.currentProbe = id;
    save();
    const started = performance.now();
    try {
      const value = await operation();
      evidence.probes[id] = {status: 'pass', milliseconds: Math.round(performance.now() - started)};
      save();
      return value;
    } catch (error) {
      evidence.probes[id] = {
        status: 'fail',
        milliseconds: Math.round(performance.now() - started),
        message: redact(error.message, [key?.toStringDer()]),
      };
      throw error;
    }
  };
  const connect = () =>
    sdk.Client.forNetwork({'127.0.0.1:35211': '0.0.3'})
      .setOperator(account, key)
      .setMaxAttempts(3)
      .setRequestTimeout(15_000);
  const receipt = async response => {
    const value = await response.getReceipt(client);
    if (value.status.toString() !== 'SUCCESS')
      throw new Failure('candidate', `Receipt ${response.transactionId}: ${value.status}`);
    return value;
  };
  const transfer = async amount => {
    const response = await new sdk.TransferTransaction()
      .addHbarTransfer(account, sdk.Hbar.fromTinybars(-amount))
      .addHbarTransfer('0.0.2', sdk.Hbar.fromTinybars(amount))
      .execute(client);
    await receipt(response);
    return {path: transactionPath(response.transactionId), amount, account: account.toString()};
  };
  const message = async (topic, content) => {
    const response = await new sdk.TopicMessageSubmitTransaction()
      .setTopicId(topic)
      .setMessage(content)
      .execute(client);
    const received = await receipt(response);
    const sequence = received.topicSequenceNumber.toString();
    return {path: `/api/v1/topics/${topic}/messages/${sequence}`, sequence, message: content};
  };
  try {
    if (mode === 'probes') {
      await probe('P7', async () => {
        const output = await command(
          configuration.soloBinary,
          ['ledger', 'account', 'create', '--deployment', 'solo-tck', '--hbar-amount', '100'],
          {
            env: process.env,
            timeout: 60_000,
            secret: true,
            group: false,
          },
        );
        const id = /"accountId"\s*:\s*"(\d+\.\d+\.\d+)"/.exec(output)?.[1];
        if (!id) throw new Failure('unknown', 'Solo account create returned no accountId');
        account = sdk.AccountId.fromString(id);
        key = sdk.PrivateKey.generateED25519();
        await command(
          configuration.soloBinary,
          [
            'ledger',
            'account',
            'update',
            '--deployment',
            'solo-tck',
            '--account-id',
            id,
            '--ed25519-private-key',
            key.toStringDer(),
          ],
          {env: process.env, timeout: 60_000, secret: true, group: false},
        );
        writeFileSync(stateFile, JSON.stringify({accountId: id, key: key.toStringDer()}), {mode: 0o600});
        client = connect();
        const info = await new sdk.AccountInfoQuery().setAccountId(account).execute(client);
        if (info.key.toString() !== key.publicKey.toString())
          throw new Failure('candidate', 'AccountInfoQuery does not contain the key Solo installed');
        evidence.accountId = id;
      });
      await probe('P5', async () => {
        evidence.transfer = await transfer(100_000_000);
        const topic = await receipt(await new sdk.TopicCreateTransaction().execute(client));
        if (!topic.topicId) throw new Failure('candidate', 'Topic creation returned no topic ID');
        evidence.topicId = topic.topicId.toString();
        evidence.message = await message(evidence.topicId, `solo-tck ${configuration.candidateSha} ${Date.now()}`);
      });
      await probe('P6', () => readbacks(configuration.mirrorUrl, evidence));
    } else if (mode === 'load') {
      const stored = JSON.parse(readFileSync(stateFile, 'utf8'));
      account = sdk.AccountId.fromString(stored.accountId);
      key = sdk.PrivateKey.fromStringDer(stored.key);
      client = connect();
      await probe('P8', async () => {
        const started = performance.now();
        const active = new Set();
        let failure;
        const load = (evidence.load = {
          durationMilliseconds: 120_000,
          transactionsPerSecond: 20,
          submitted: 0,
          successful: 0,
          maxScheduleLagMilliseconds: 0,
        });
        for (let index = 0; index < 2400 && !failure; index++) {
          const target = started + index * 50;
          await delay(Math.max(0, target - performance.now()));
          const lag = performance.now() - target;
          load.maxScheduleLagMilliseconds = Math.max(load.maxScheduleLagMilliseconds, Math.round(lag));
          if (lag > 1000 || active.size >= 200)
            throw new Failure('unknown', 'The load generator could not sustain 20 transactions per second');
          load.submitted++;
          const operation = (index % 2 ? message(evidence.topicId, `solo-tck load ${index}`) : transfer(1000))
            .then(value => recordLoadReceipt(load, index, value))
            .catch(error => {
              failure ||= error;
            })
            .finally(() => active.delete(operation));
          active.add(operation);
          if (index % 20 === 0) save();
        }
        await Promise.all(active);
        if (failure) throw failure;
        await delay(Math.max(0, started + 120_000 - performance.now()));
        if (load.submitted !== 2400 || load.successful !== 2400)
          throw new Failure('candidate', 'Not all 2400 load transactions received SUCCESS');
        await readbacks(configuration.mirrorUrl, {transfer: load.lastTransfer, message: load.lastMessage});
        load.elapsedMilliseconds = Math.round(performance.now() - started);
      });
    } else throw new Failure('kit', `Unknown probe worker mode ${mode}`);
  } catch (error) {
    evidence.reason = error.reason || (evidence.currentProbe === 'P7' ? 'unknown' : 'candidate');
    evidence.error = redact(error.message, [key?.toStringDer()]);
    process.exitCode = EXIT[evidence.reason];
  } finally {
    client?.close();
    delete evidence.currentProbe;
    save();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await worker(...process.argv.slice(2));
}
