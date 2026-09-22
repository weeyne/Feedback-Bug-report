import { connect, disconnect } from '@dymcode/db-tests/harness';
import { afterAll, beforeAll } from 'vitest';

beforeAll(connect);
afterAll(disconnect);
