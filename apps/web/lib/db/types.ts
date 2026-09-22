export type Row = Record<string, unknown>;

/** The only database surface use cases depend on: parameterized SQL returning rows. */
export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}
