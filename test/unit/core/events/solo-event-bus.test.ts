// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {expect} from 'chai';
import {describe, it, beforeEach} from 'mocha';
import {type SoloEventBus} from '../../../../src/core/events/solo-event-bus.js';
import {DefaultSoloEventBus} from '../../../../src/core/events/default-solo-event-bus.js';
import {SoloEventType} from '../../../../src/core/events/event-types/solo-event.js';
import {NetworkDeployedEvent} from '../../../../src/core/events/event-types/network-deployed-event.js';
import {MirrorNodeDeployedEvent} from '../../../../src/core/events/event-types/mirror-node-deployed-event.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../../src/core/dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {Duration} from '../../../../src/core/time/duration.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import {PipelineCancelledSoloError} from '../../../../src/core/errors/classes/internal/pipeline-cancelled-solo-error.js';

describe('SoloEventBus', (): void => {
  let bus: SoloEventBus;

  const networkEvent: NetworkDeployedEvent = new NetworkDeployedEvent('my-deployment');
  const mirrorEvent: MirrorNodeDeployedEvent = new MirrorNodeDeployedEvent('my-deployment');

  beforeEach((): void => {
    // resolve the test logger from the DI container
    const testLogger: SoloLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);
    bus = new DefaultSoloEventBus(testLogger);
  });

  it('should call a registered handler when the matching event is emitted', (): void => {
    const handler: sinon.SinonSpy = sinon.spy();
    bus.on(SoloEventType.NetworkDeployed, handler);
    bus.emit(networkEvent);
    expect(handler).to.have.been.calledOnceWithExactly(networkEvent);
  });

  it('should not call a handler after it has been removed with off()', (): void => {
    const handler: sinon.SinonSpy = sinon.spy();
    bus.on(SoloEventType.NetworkDeployed, handler);
    bus.off(SoloEventType.NetworkDeployed, handler);
    bus.emit(networkEvent);
    expect(handler).not.to.have.been.called;
  });

  it('should call all registered handlers for the same event type', (): void => {
    const handlerA: sinon.SinonSpy = sinon.spy();
    const handlerB: sinon.SinonSpy = sinon.spy();
    bus.on(SoloEventType.NetworkDeployed, handlerA);
    bus.on(SoloEventType.NetworkDeployed, handlerB);
    bus.emit(networkEvent);
    expect(handlerA).to.have.been.calledOnceWithExactly(networkEvent);
    expect(handlerB).to.have.been.calledOnceWithExactly(networkEvent);
  });

  it('should not call a handler registered for a different event type', (): void => {
    const handler: sinon.SinonSpy = sinon.spy();
    bus.on(SoloEventType.MirrorNodeDeployed, handler);
    bus.emit(networkEvent);
    expect(handler).not.to.have.been.called;
  });

  it('should call handlers for different event types independently', (): void => {
    const networkHandler: sinon.SinonSpy = sinon.spy();
    const mirrorHandler: sinon.SinonSpy = sinon.spy();
    bus.on(SoloEventType.NetworkDeployed, networkHandler);
    bus.on(SoloEventType.MirrorNodeDeployed, mirrorHandler);
    bus.emit(networkEvent);
    bus.emit(mirrorEvent);
    expect(networkHandler).to.have.been.calledOnceWithExactly(networkEvent);
    expect(mirrorHandler).to.have.been.calledOnceWithExactly(mirrorEvent);
  });

  it('should only remove the specific handler passed to off(), leaving others intact', (): void => {
    const handlerA: sinon.SinonSpy = sinon.spy();
    const handlerB: sinon.SinonSpy = sinon.spy();
    bus.on(SoloEventType.NetworkDeployed, handlerA);
    bus.on(SoloEventType.NetworkDeployed, handlerB);
    bus.off(SoloEventType.NetworkDeployed, handlerA);
    bus.emit(networkEvent);
    expect(handlerA).not.to.have.been.called;
    expect(handlerB).to.have.been.calledOnceWithExactly(networkEvent);
  });

  it('should call a handler each time the event is emitted', (): void => {
    const handler: sinon.SinonSpy = sinon.spy();
    bus.on(SoloEventType.NetworkDeployed, handler);
    bus.emit(networkEvent);
    bus.emit(networkEvent);
    expect(handler).to.have.been.calledTwice;
  });

  it('waitFor() should resolve with the event when it is emitted', async (): Promise<void> => {
    const promise: Promise<NetworkDeployedEvent> = bus.waitFor<NetworkDeployedEvent>(SoloEventType.NetworkDeployed);
    bus.emit(networkEvent);
    const result: NetworkDeployedEvent = await promise;
    expect(result).to.equal(networkEvent);
  });

  it('waitFor() should resolve only once even if the event is emitted multiple times', async (): Promise<void> => {
    const results: NetworkDeployedEvent[] = [];
    const promise: Promise<NetworkDeployedEvent> = bus.waitFor<NetworkDeployedEvent>(SoloEventType.NetworkDeployed);
    promise.then((soloEvent: NetworkDeployedEvent): number => results.push(soloEvent));
    bus.emit(networkEvent);
    bus.emit(networkEvent);
    await promise;
    expect(results).to.have.lengthOf(1);
  });

  it('waitFor() should not resolve for a different event type', async (): Promise<void> => {
    let resolved: boolean = false;
    bus.waitFor<NetworkDeployedEvent>(SoloEventType.NetworkDeployed).then((): void => {
      resolved = true;
    });
    bus.emit(mirrorEvent);
    await Promise.resolve(); // flush microtask queue
    expect(resolved).to.be.false;
  });

  it('waitFor() with predicate should resolve when the predicate returns true', async (): Promise<void> => {
    const target: NetworkDeployedEvent = new NetworkDeployedEvent('target');
    const other: NetworkDeployedEvent = new NetworkDeployedEvent('other');
    const promise: Promise<NetworkDeployedEvent> = bus.waitFor<NetworkDeployedEvent>(
      SoloEventType.NetworkDeployed,
      (soloEvent: NetworkDeployedEvent): boolean => soloEvent.deployment === 'target',
    );
    bus.emit(other);
    bus.emit(target);
    expect(await promise).to.equal(target);
  });

  it('waitFor() with predicate should skip events that do not match', async (): Promise<void> => {
    let resolved: boolean = false;
    bus
      .waitFor<NetworkDeployedEvent>(
        SoloEventType.NetworkDeployed,
        (soloEvent: NetworkDeployedEvent): boolean => soloEvent.deployment === 'target',
      )
      .then((): void => {
        resolved = true;
      });
    bus.emit(new NetworkDeployedEvent('other'));
    await Promise.resolve();
    expect(resolved).to.be.false;
  });

  it('waitFor() with predicate should resolve only once even if multiple matching events are emitted', async (): Promise<void> => {
    const results: NetworkDeployedEvent[] = [];
    const promise: Promise<NetworkDeployedEvent> = bus.waitFor<NetworkDeployedEvent>(
      SoloEventType.NetworkDeployed,
      (): boolean => true,
    );
    promise.then((soloEvent: NetworkDeployedEvent): number => results.push(soloEvent));
    bus.emit(networkEvent);
    bus.emit(networkEvent);
    await promise;
    expect(results).to.have.lengthOf(1);
  });

  it('waitFor() for different types resolves each independently', async (): Promise<void> => {
    const networkPromise: Promise<NetworkDeployedEvent> = bus.waitFor<NetworkDeployedEvent>(
      SoloEventType.NetworkDeployed,
    );
    const mirrorPromise: Promise<MirrorNodeDeployedEvent> = bus.waitFor<MirrorNodeDeployedEvent>(
      SoloEventType.MirrorNodeDeployed,
    );
    bus.emit(networkEvent);
    bus.emit(mirrorEvent);
    expect(await networkPromise).to.equal(networkEvent);
    expect(await mirrorPromise).to.equal(mirrorEvent);
  });

  it('NetworkDeployedEvent should have the correct type and deployment', (): void => {
    const event: NetworkDeployedEvent = new NetworkDeployedEvent('solo-deployment');
    expect(event.type).to.equal(SoloEventType.NetworkDeployed);
    expect(event.deployment).to.equal('solo-deployment');
  });

  it('MirrorNodeDeployedEvent should have the correct type and deployment', (): void => {
    const event: MirrorNodeDeployedEvent = new MirrorNodeDeployedEvent('solo-deployment');
    expect(event.type).to.equal(SoloEventType.MirrorNodeDeployed);
    expect(event.deployment).to.equal('solo-deployment');
  });

  it('waitFor() should resolve if event was emitted before waitFor is called', async (): Promise<void> => {
    // Emit the event first (before waitFor is called)
    bus.emit(networkEvent);

    // Now call waitFor; it should resolve immediately with the past event
    const promise: Promise<NetworkDeployedEvent> = bus.waitFor<NetworkDeployedEvent>(SoloEventType.NetworkDeployed);
    const result: NetworkDeployedEvent = await promise;
    expect(result).to.equal(networkEvent);
  });

  describe('waitFor() timeout', (): void => {
    it('should reject with a SoloError when the timeout elapses before the event is emitted', async (): Promise<void> => {
      const promise: Promise<NetworkDeployedEvent> = bus.waitFor<NetworkDeployedEvent>(
        SoloEventType.NetworkDeployed,
        undefined,
        Duration.ofMillis(10),
      );
      await expect(promise).to.be.rejectedWith(SoloError, /timed out/);
    });

    it('should resolve before the timeout if the event arrives in time', async (): Promise<void> => {
      const promise: Promise<NetworkDeployedEvent> = bus.waitFor<NetworkDeployedEvent>(
        SoloEventType.NetworkDeployed,
        undefined,
        Duration.ofMillis(100),
      );
      bus.emit(networkEvent);
      expect(await promise).to.equal(networkEvent);
    });

    it('should resolve immediately from history before the timeout fires', async (): Promise<void> => {
      bus.emit(networkEvent);
      const result: NetworkDeployedEvent = await bus.waitFor<NetworkDeployedEvent>(
        SoloEventType.NetworkDeployed,
        undefined,
        Duration.ofMillis(10),
      );
      expect(result).to.equal(networkEvent);
    });
  });

  describe('clearHistory()', (): void => {
    it('should prevent waitFor() from resolving against a cleared event type', async (): Promise<void> => {
      bus.emit(networkEvent);
      bus.clearHistory(SoloEventType.NetworkDeployed);

      let resolved: boolean = false;
      bus.waitFor<NetworkDeployedEvent>(SoloEventType.NetworkDeployed).then((): void => {
        resolved = true;
      });
      await Promise.resolve();
      expect(resolved).to.be.false;
    });

    it('should not affect history for other event types when clearing a specific type', async (): Promise<void> => {
      bus.emit(networkEvent);
      bus.emit(mirrorEvent);
      bus.clearHistory(SoloEventType.NetworkDeployed);

      // mirror history should still resolve waitFor immediately
      const result: MirrorNodeDeployedEvent = await bus.waitFor<MirrorNodeDeployedEvent>(
        SoloEventType.MirrorNodeDeployed,
      );
      expect(result).to.equal(mirrorEvent);
    });

    it('should clear all event type histories when called with no argument', async (): Promise<void> => {
      bus.emit(networkEvent);
      bus.emit(mirrorEvent);
      bus.clearHistory();

      let networkResolved: boolean = false;
      let mirrorResolved: boolean = false;
      bus.waitFor<NetworkDeployedEvent>(SoloEventType.NetworkDeployed).then((): void => {
        networkResolved = true;
      });
      bus.waitFor<MirrorNodeDeployedEvent>(SoloEventType.MirrorNodeDeployed).then((): void => {
        mirrorResolved = true;
      });
      await Promise.resolve();
      expect(networkResolved).to.be.false;
      expect(mirrorResolved).to.be.false;
    });

    it('should allow new events to be recorded after history is cleared', async (): Promise<void> => {
      bus.emit(networkEvent);
      bus.clearHistory(SoloEventType.NetworkDeployed);

      const newEvent: NetworkDeployedEvent = new NetworkDeployedEvent('new-deployment');
      bus.emit(newEvent);

      const result: NetworkDeployedEvent = await bus.waitFor<NetworkDeployedEvent>(SoloEventType.NetworkDeployed);
      expect(result).to.equal(newEvent);
    });

    it('should be a no-op when called on a type with no recorded history', (): void => {
      expect((): void => bus.clearHistory(SoloEventType.NetworkDeployed)).not.to.throw();
    });

    it('should be a no-op when called with no argument on an empty bus', (): void => {
      expect((): void => bus.clearHistory()).not.to.throw();
    });
  });

  describe('abort()', (): void => {
    it('should reject a pending waitFor() immediately with a PipelineCancelledSoloError wrapping the reason', async (): Promise<void> => {
      const reason: SoloError = new SoloError('consensus node deploy failed');
      // A long timeout ensures the rejection comes from abort(), not the timer.
      const promise: Promise<NetworkDeployedEvent> = bus.waitFor<NetworkDeployedEvent>(
        SoloEventType.NetworkDeployed,
        undefined,
        Duration.ofMinutes(10),
      );
      bus.abort(reason);
      const error: PipelineCancelledSoloError = await expect(promise).to.be.rejectedWith(PipelineCancelledSoloError);
      expect(error.cause).to.equal(reason);
    });

    it('should reject a subsequent waitFor() immediately once aborted', async (): Promise<void> => {
      const reason: SoloError = new SoloError('root cause');
      bus.abort(reason);
      const error: PipelineCancelledSoloError = await expect(
        bus.waitFor<NetworkDeployedEvent>(SoloEventType.NetworkDeployed, undefined, Duration.ofMinutes(10)),
      ).to.be.rejectedWith(PipelineCancelledSoloError);
      expect(error.cause).to.equal(reason);
    });

    it('abortReason() should return the first reason and later aborts should not overwrite it', (): void => {
      const first: SoloError = new SoloError('first failure');
      const second: SoloError = new SoloError('second failure');
      expect(bus.abortReason()).to.be.undefined;
      bus.abort(first);
      bus.abort(second);
      expect(bus.abortReason()).to.equal(first);
    });

    it('reset() should clear the aborted state so a fresh waitFor() blocks again', async (): Promise<void> => {
      bus.abort(new SoloError('failure'));
      expect(bus.abortReason()).to.not.be.undefined;

      bus.reset();
      expect(bus.abortReason()).to.be.undefined;

      let resolved: boolean = false;
      bus.waitFor<NetworkDeployedEvent>(SoloEventType.NetworkDeployed).then((): void => {
        resolved = true;
      });
      await Promise.resolve();
      expect(resolved).to.be.false;
    });

    it('reset() should clear recorded history', async (): Promise<void> => {
      bus.emit(networkEvent);
      bus.reset();

      let resolved: boolean = false;
      bus.waitFor<NetworkDeployedEvent>(SoloEventType.NetworkDeployed).then((): void => {
        resolved = true;
      });
      await Promise.resolve();
      expect(resolved).to.be.false;
    });
  });
});
