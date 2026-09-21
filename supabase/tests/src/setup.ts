import { afterAll, beforeAll } from 'vitest';
import { connect, disconnect } from './db';

beforeAll(connect);
afterAll(disconnect);
