export type Row = Record<string, unknown>;

/** The only database surface use cases depend on. */
export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /**
   * Runs fn in a transaction (a savepoint inside test transactions). Never use another Db inside fn.
   * Nesting is not supported: calling `transaction` again from within `fn` throws in production
   * (the test harness uses savepoints and permits it there only).
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
