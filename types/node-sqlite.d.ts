// apps/resurface/types/node-sqlite.d.ts

// packages/apps/resurface/types/node-sqlite.d.ts

declare module 'node:sqlite' {
  export class StatementSync {
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown
    run(...params: unknown[]): { changes: number; lastInsertRowid: number }
  }

  export class DatabaseSync {
    constructor(path: string)
    close(): void
    exec(sql: string): void
    prepare(sql: string): StatementSync
  }
}
