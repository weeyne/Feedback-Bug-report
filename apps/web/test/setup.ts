import { connect, disconnect } from '@bugping/db-tests/harness';
import { afterAll, beforeAll } from 'vitest';

beforeAll(connect);
afterAll(disconnect);
