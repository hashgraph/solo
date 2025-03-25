// SPDX-License-Identifier: Apache-2.0

// eslint-disable-next-line n/no-extraneous-import
import 'reflect-metadata';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinonChai from 'sinon-chai';
import {resetForTest} from './test-container.js';

resetForTest();

chai.use(chaiAsPromised);
chai.use(sinonChai);

chai.config.truncateThreshold = Infinity;
