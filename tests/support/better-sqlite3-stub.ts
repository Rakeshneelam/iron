/** drizzle's better-sqlite3 driver imports the package even when handed a client. */
export default class NotUsed {
  constructor() {
    throw new Error('tests pass their own client');
  }
}
