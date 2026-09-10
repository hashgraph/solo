// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import {GitHubApiClient} from '../../../src/core/github-api-client.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';

function makeOkResponse(body: unknown = {}): {
  ok: boolean;
  status: number;
  headers: {get: () => undefined};
  json: () => Promise<unknown>;
} {
  return {
    ok: true,
    status: 200,
    headers: {get: (): undefined => undefined},
    json: async (): Promise<unknown> => body,
  };
}

function makeErrorResponse(
  status: number,
  headers: Record<string, string | undefined> = {},
): {ok: boolean; status: number; headers: {get: (name: string) => string | undefined}; json: () => Promise<never>} {
  return {
    ok: false,
    status,
    headers: {
      get: (name: string): string | undefined => headers[name],
    },
    json: async (): Promise<never> => {
      throw new Error('not used');
    },
  };
}

describe('GitHubApiClient', (): void => {
  let fetchStub: SinonStub;
  let clock: sinon.SinonFakeTimers;

  beforeEach((): void => {
    fetchStub = sinon.stub(globalThis, 'fetch' as never);
    clock = sinon.useFakeTimers();
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('get', (): void => {
    it('returns the Response when the request succeeds', async (): Promise<void> => {
      fetchStub.resolves(makeOkResponse({tag_name: 'v1.0.0'}));

      const response: Response = await GitHubApiClient.get('https://api.github.com/repos/foo/bar/releases');

      expect(response.ok).to.be.true;
      expect(fetchStub).to.have.been.calledOnce;
    });

    it('adds Authorization header when GITHUB_TOKEN is set', async (): Promise<void> => {
      const originalToken: string | undefined = process.env.GITHUB_TOKEN;
      const originalGhToken: string | undefined = process.env.GH_TOKEN;
      process.env.GITHUB_TOKEN = 'test-token';
      delete process.env.GH_TOKEN;
      try {
        fetchStub.resolves(makeOkResponse());

        await GitHubApiClient.get('https://api.github.com/test');

        const requestInit: RequestInit = fetchStub.firstCall.args[1] as RequestInit;
        const headers: Record<string, string> = requestInit.headers as Record<string, string>;
        expect(headers['Authorization']).to.equal('Bearer test-token');
      } finally {
        if (originalToken === undefined) {
          delete process.env.GITHUB_TOKEN;
        } else {
          process.env.GITHUB_TOKEN = originalToken;
        }
        if (originalGhToken === undefined) {
          delete process.env.GH_TOKEN;
        } else {
          process.env.GH_TOKEN = originalGhToken;
        }
      }
    });

    it('adds Authorization header when only GH_TOKEN is set', async (): Promise<void> => {
      const originalToken: string | undefined = process.env.GITHUB_TOKEN;
      const originalGhToken: string | undefined = process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;
      process.env.GH_TOKEN = 'gh-test-token';
      try {
        fetchStub.resolves(makeOkResponse());

        await GitHubApiClient.get('https://api.github.com/test');

        const requestInit: RequestInit = fetchStub.firstCall.args[1] as RequestInit;
        const headers: Record<string, string> = requestInit.headers as Record<string, string>;
        expect(headers['Authorization']).to.equal('Bearer gh-test-token');
      } finally {
        if (originalToken !== undefined) {
          process.env.GITHUB_TOKEN = originalToken;
        }
        if (originalGhToken === undefined) {
          delete process.env.GH_TOKEN;
        } else {
          process.env.GH_TOKEN = originalGhToken;
        }
      }
    });

    it('prefers GITHUB_TOKEN over GH_TOKEN', async (): Promise<void> => {
      const originalToken: string | undefined = process.env.GITHUB_TOKEN;
      const originalGhToken: string | undefined = process.env.GH_TOKEN;
      process.env.GITHUB_TOKEN = 'github-token';
      process.env.GH_TOKEN = 'gh-token';
      try {
        fetchStub.resolves(makeOkResponse());

        await GitHubApiClient.get('https://api.github.com/test');

        const requestInit: RequestInit = fetchStub.firstCall.args[1] as RequestInit;
        const headers: Record<string, string> = requestInit.headers as Record<string, string>;
        expect(headers['Authorization']).to.equal('Bearer github-token');
      } finally {
        if (originalToken === undefined) {
          delete process.env.GITHUB_TOKEN;
        } else {
          process.env.GITHUB_TOKEN = originalToken;
        }
        if (originalGhToken === undefined) {
          delete process.env.GH_TOKEN;
        } else {
          process.env.GH_TOKEN = originalGhToken;
        }
      }
    });

    it('omits Authorization header when GITHUB_TOKEN and GH_TOKEN are not set', async (): Promise<void> => {
      const originalToken: string | undefined = process.env.GITHUB_TOKEN;
      const originalGhToken: string | undefined = process.env.GH_TOKEN;
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;
      try {
        fetchStub.resolves(makeOkResponse());

        await GitHubApiClient.get('https://api.github.com/test');

        const requestInit: RequestInit = fetchStub.firstCall.args[1] as RequestInit;
        const headers: Record<string, string> = requestInit.headers as Record<string, string>;
        expect(headers['Authorization']).to.be.undefined;
      } finally {
        if (originalToken !== undefined) {
          process.env.GITHUB_TOKEN = originalToken;
        }
        if (originalGhToken !== undefined) {
          process.env.GH_TOKEN = originalGhToken;
        }
      }
    });

    it('retries on HTTP 403 and succeeds on the next attempt', async (): Promise<void> => {
      fetchStub.onFirstCall().resolves(makeErrorResponse(403));
      fetchStub.onSecondCall().resolves(makeOkResponse());

      const promise: Promise<Response> = GitHubApiClient.get('https://api.github.com/test');
      await clock.tickAsync(1100);
      const response: Response = await promise;

      expect(response.ok).to.be.true;
      expect(fetchStub).to.have.been.calledTwice;
    });

    it('retries on HTTP 429 and succeeds on the next attempt', async (): Promise<void> => {
      fetchStub.onFirstCall().resolves(makeErrorResponse(429));
      fetchStub.onSecondCall().resolves(makeOkResponse());

      const promise: Promise<Response> = GitHubApiClient.get('https://api.github.com/test');
      await clock.tickAsync(1100);
      const response: Response = await promise;

      expect(response.ok).to.be.true;
      expect(fetchStub).to.have.been.calledTwice;
    });

    it('honours the Retry-After header for the backoff delay', async (): Promise<void> => {
      fetchStub.onFirstCall().resolves(makeErrorResponse(429, {'Retry-After': '5'}));
      fetchStub.onSecondCall().resolves(makeOkResponse());

      const promise: Promise<Response> = GitHubApiClient.get('https://api.github.com/test');
      // Advance just past the Retry-After period (5 000 ms)
      await clock.tickAsync(5100);
      const response: Response = await promise;

      expect(response.ok).to.be.true;
      expect(fetchStub).to.have.been.calledTwice;
    });

    it('throws SoloError after exhausting all retries on HTTP 403', async (): Promise<void> => {
      fetchStub.resolves(makeErrorResponse(403));

      const promise: Promise<Response> = GitHubApiClient.get('https://api.github.com/test');
      // Three attempts: delays 1 s, then 2 s
      await clock.tickAsync(4000);

      await expect(promise).to.be.rejectedWith(SoloError, /HTTP 403/);
      expect(fetchStub).to.have.been.calledThrice;
    });

    it('does not retry on non-rate-limit errors (e.g. HTTP 404)', async (): Promise<void> => {
      fetchStub.resolves(makeErrorResponse(404));

      await expect(GitHubApiClient.get('https://api.github.com/test')).to.be.rejectedWith(SoloError, /HTTP 404/);
      expect(fetchStub).to.have.been.calledOnce;
    });

    it('throws SoloError when fetch itself rejects (network failure)', async (): Promise<void> => {
      fetchStub.rejects(new Error('network failure'));

      await expect(GitHubApiClient.get('https://api.github.com/test')).to.be.rejectedWith(SoloError);
      expect(fetchStub).to.have.been.calledOnce;
    });
  });
});
