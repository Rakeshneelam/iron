/**
 * A node:sqlite database that speaks enough better-sqlite3 for Drizzle, so the real
 * repositories can be tested against real SQL instead of a mock. Test-only.
 */
import { DatabaseSync, type StatementSync } from 'node:sqlite';

type Params = unknown[];

class Stmt {
  readonly stmt: StatementSync;
  readonly rawMode: boolean;
  constructor(stmt: StatementSync, rawMode = false) {
    this.stmt = stmt;
    this.rawMode = rawMode;
    // Joins select two `id` columns; object rows would collapse them onto one key,
    // so positional rows are the only faithful mapping for Drizzle's array mode.
    stmt.setReturnArrays(rawMode);
  }
  run(...p: Params) {
    return this.stmt.run(...(p as never[]));
  }
  get(...p: Params) {
    this.stmt.setReturnArrays(this.rawMode);
    return this.stmt.get(...(p as never[]));
  }
  all(...p: Params) {
    this.stmt.setReturnArrays(this.rawMode);
    return this.stmt.all(...(p as never[]));
  }
  raw() {
    return new Stmt(this.stmt, true);
  }
}

export class TestSqlite {
  readonly inner = new DatabaseSync(':memory:');
  prepare(sql: string) {
    return new Stmt(this.inner.prepare(sql));
  }
  exec(sql: string) {
    this.inner.exec(sql);
  }
  /* ---- the expo-sqlite surface the app uses directly ---- */
  execSync(sql: string) {
    // PRAGMA journal_mode returns a row; exec() rejects that, so run it as a query.
    if (/^\s*PRAGMA/i.test(sql)) {
      try {
        this.inner.prepare(sql).get();
        return;
      } catch {
        return;
      }
    }
    this.inner.exec(sql);
  }
  getAllSync<T>(sql: string): T[] {
    return this.inner.prepare(sql).all() as T[];
  }
  /** better-sqlite3 shape: returns a callable with .deferred/.immediate/.exclusive. */
  transaction<A extends unknown[], R>(fn: (...args: A) => R) {
    const run = (...args: A): R => {
      this.inner.exec('BEGIN');
      try {
        const out = fn(...args);
        this.inner.exec('COMMIT');
        return out;
      } catch (e) {
        this.inner.exec('ROLLBACK');
        throw e;
      }
    };
    return Object.assign(run, { deferred: run, immediate: run, exclusive: run });
  }

  withTransactionSync(fn: () => void): void {
    this.inner.exec('BEGIN');
    try {
      fn();
      this.inner.exec('COMMIT');
    } catch (e) {
      this.inner.exec('ROLLBACK');
      throw e;
    }
  }
}
