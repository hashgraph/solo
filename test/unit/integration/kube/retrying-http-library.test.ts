// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, before, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonFakeTimers} from 'sinon';
// eslint-disable-next-line no-restricted-imports
import {HttpMethod, Observable, RequestContext, ResponseContext, type HttpLibrary} from '@kubernetes/client-node';
import {StatusCodes} from 'http-status-codes';
import {RetryingHttpLibrary} from '../../../../src/integration/kube/k8-client/retrying-http-library.js';
import {resetForTest} from '../../../test-container.js';

type ResponseFactory = () => ResponseContext;

/**
 * A fake HTTP library that records every request and mints a fresh single-use response per request from
 * queued factories (mirroring the real library), repeating the last factory once the queue is exhausted.
 */
class QueuedHttpLibrary implements HttpLibrary {
  public readonly requests: RequestContext[] = [];

  public constructor(private readonly responseFactories: ResponseFactory[]) {}

  public send(request: RequestContext): Observable<ResponseContext> {
    this.requests.push(request);
    const responseIndex: number = Math.min(this.requests.length, this.responseFactories.length) - 1;
    return new Observable<ResponseContext>(Promise.resolve(this.responseFactories[responseIndex]()));
  }
}

function buildResponse(statusCode: number, headers: Record<string, string> = {}): ResponseContext {
  let bodyConsumed: boolean = false;
  return new ResponseContext(statusCode, headers, {
    text: (): Promise<string> => {
      if (bodyConsumed) {
        return Promise.reject(new Error('body has already been consumed'));
      }
      bodyConsumed = true;
      return Promise.resolve('');
    },
    binary: (): Promise<Buffer> => Promise.resolve(Buffer.alloc(0)),
  });
}

function buildRequest(): RequestContext {
  return new RequestContext('https://localhost:6443/api/v1/namespaces', HttpMethod.GET);
}

describe('RetryingHttpLibrary', (): void => {
  let clock: SinonFakeTimers;

  before((): void => {
    resetForTest();
  });

  beforeEach((): void => {
    clock = sinon.useFakeTimers();
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('returns the delegate response when the request is not throttled', async (): Promise<void> => {
    const delegate: QueuedHttpLibrary = new QueuedHttpLibrary([(): ResponseContext => buildResponse(StatusCodes.OK)]);
    const library: RetryingHttpLibrary = new RetryingHttpLibrary(delegate);

    const response: ResponseContext = await library.send(buildRequest());

    expect(response.httpStatusCode).to.equal(StatusCodes.OK);
    expect(delegate.requests).to.have.lengthOf(1);
  });

  it('does not retry non-throttled error responses', async (): Promise<void> => {
    const delegate: QueuedHttpLibrary = new QueuedHttpLibrary([
      (): ResponseContext => buildResponse(StatusCodes.INTERNAL_SERVER_ERROR),
    ]);
    const library: RetryingHttpLibrary = new RetryingHttpLibrary(delegate);

    const response: ResponseContext = await library.send(buildRequest());

    expect(response.httpStatusCode).to.equal(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(delegate.requests).to.have.lengthOf(1);
  });

  it('retries a throttled request honoring the Retry-After header', async (): Promise<void> => {
    const delegate: QueuedHttpLibrary = new QueuedHttpLibrary([
      (): ResponseContext => buildResponse(StatusCodes.TOO_MANY_REQUESTS, {'retry-after': '2'}),
      (): ResponseContext => buildResponse(StatusCodes.OK),
    ]);
    const library: RetryingHttpLibrary = new RetryingHttpLibrary(delegate);

    let resolved: boolean = false;
    const resultPromise: Promise<ResponseContext> = library
      .send(buildRequest())
      .then((response: ResponseContext): ResponseContext => {
        resolved = true;
        return response;
      });

    await clock.tickAsync(1999);
    expect(resolved, 'the request must not be resent before the Retry-After delay elapses').to.be.false;
    expect(delegate.requests).to.have.lengthOf(1);

    await clock.tickAsync(1);
    const response: ResponseContext = await resultPromise;

    expect(response.httpStatusCode).to.equal(StatusCodes.OK);
    expect(delegate.requests).to.have.lengthOf(2);
  });

  it('falls back to exponential backoff when the Retry-After header is absent', async (): Promise<void> => {
    const delegate: QueuedHttpLibrary = new QueuedHttpLibrary([
      (): ResponseContext => buildResponse(StatusCodes.TOO_MANY_REQUESTS),
      (): ResponseContext => buildResponse(StatusCodes.TOO_MANY_REQUESTS),
      (): ResponseContext => buildResponse(StatusCodes.OK),
    ]);
    const library: RetryingHttpLibrary = new RetryingHttpLibrary(delegate);

    const resultPromise: Promise<ResponseContext> = library.send(buildRequest());

    await clock.tickAsync(999);
    expect(delegate.requests, 'the first retry must wait the full 1 second backoff').to.have.lengthOf(1);
    await clock.tickAsync(1);
    expect(delegate.requests).to.have.lengthOf(2);

    await clock.tickAsync(1999);
    expect(delegate.requests, 'the second retry must wait the doubled 2 second backoff').to.have.lengthOf(2);
    await clock.tickAsync(1);
    const response: ResponseContext = await resultPromise;

    expect(response.httpStatusCode).to.equal(StatusCodes.OK);
    expect(delegate.requests).to.have.lengthOf(3);
  });

  it('falls back to exponential backoff when the Retry-After header is unparseable', async (): Promise<void> => {
    const delegate: QueuedHttpLibrary = new QueuedHttpLibrary([
      (): ResponseContext => buildResponse(StatusCodes.TOO_MANY_REQUESTS, {'retry-after': 'later'}),
      (): ResponseContext => buildResponse(StatusCodes.OK),
    ]);
    const library: RetryingHttpLibrary = new RetryingHttpLibrary(delegate);

    const resultPromise: Promise<ResponseContext> = library.send(buildRequest());

    await clock.tickAsync(1000);
    const response: ResponseContext = await resultPromise;

    expect(response.httpStatusCode).to.equal(StatusCodes.OK);
    expect(delegate.requests).to.have.lengthOf(2);
  });

  it('caps the retry delay regardless of the Retry-After header value', async (): Promise<void> => {
    const delegate: QueuedHttpLibrary = new QueuedHttpLibrary([
      (): ResponseContext => buildResponse(StatusCodes.TOO_MANY_REQUESTS, {'retry-after': '3600'}),
      (): ResponseContext => buildResponse(StatusCodes.OK),
    ]);
    const library: RetryingHttpLibrary = new RetryingHttpLibrary(delegate);

    const resultPromise: Promise<ResponseContext> = library.send(buildRequest());

    await clock.tickAsync(14_999);
    expect(delegate.requests, 'the retry must wait the full capped delay of 15 seconds').to.have.lengthOf(1);

    await clock.tickAsync(1);
    const response: ResponseContext = await resultPromise;

    expect(response.httpStatusCode).to.equal(StatusCodes.OK);
    expect(delegate.requests).to.have.lengthOf(2);
  });

  it('returns the throttled response after exhausting all retries', async (): Promise<void> => {
    const delegate: QueuedHttpLibrary = new QueuedHttpLibrary([
      (): ResponseContext => buildResponse(StatusCodes.TOO_MANY_REQUESTS, {'retry-after': '1'}),
    ]);
    const library: RetryingHttpLibrary = new RetryingHttpLibrary(delegate);

    const resultPromise: Promise<ResponseContext> = library.send(buildRequest());

    await clock.tickAsync(5000);
    const response: ResponseContext = await resultPromise;

    expect(response.httpStatusCode).to.equal(StatusCodes.TOO_MANY_REQUESTS);
    expect(delegate.requests).to.have.lengthOf(6);
  });

  it('consumes the body of every discarded throttled response', async (): Promise<void> => {
    const throttledResponse: ResponseContext = buildResponse(StatusCodes.TOO_MANY_REQUESTS, {'retry-after': '1'});
    const textStub: sinon.SinonStub = sinon.stub(throttledResponse.body, 'text').resolves('');
    const delegate: QueuedHttpLibrary = new QueuedHttpLibrary([
      (): ResponseContext => throttledResponse,
      (): ResponseContext => buildResponse(StatusCodes.OK),
    ]);
    const library: RetryingHttpLibrary = new RetryingHttpLibrary(delegate);

    const resultPromise: Promise<ResponseContext> = library.send(buildRequest());

    await clock.tickAsync(1000);
    await resultPromise;

    expect(textStub.calledOnce).to.be.true;
  });

  it('retries even when reading the discarded throttled response body fails', async (): Promise<void> => {
    const throttledResponse: ResponseContext = buildResponse(StatusCodes.TOO_MANY_REQUESTS, {'retry-after': '1'});
    sinon.stub(throttledResponse.body, 'text').rejects(new Error('stream already consumed'));
    const delegate: QueuedHttpLibrary = new QueuedHttpLibrary([
      (): ResponseContext => throttledResponse,
      (): ResponseContext => buildResponse(StatusCodes.OK),
    ]);
    const library: RetryingHttpLibrary = new RetryingHttpLibrary(delegate);

    const resultPromise: Promise<ResponseContext> = library.send(buildRequest());

    await clock.tickAsync(1000);
    const response: ResponseContext = await resultPromise;

    expect(response.httpStatusCode).to.equal(StatusCodes.OK);
    expect(delegate.requests).to.have.lengthOf(2);
  });
});
