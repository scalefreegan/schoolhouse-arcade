// Types for the plain-ESM modules the server imports from scripts/ (kept
// .mjs so the CLIs run with no build step and no dependency on web/).

declare module "*/scripts/env.mjs" {
  export const ROOT: string;
  /** SCHOOLHOUSE_ARCADE_ENV_FILE (resolved against the repo root), else <repo>/.env.local. */
  export function envFile(root?: string): string;
  /** KEY=VALUE lines → an object; comments, `export ` and one layer of quotes tolerated. */
  export function parseEnv(text: string): Record<string, string>;
}

declare module "*/scripts/db/config.mjs" {
  export const DEFAULT_DATABASE_URL: string;
  export const MIGRATIONS_DIR: string;
  export function isLinkedWorktree(root?: string): boolean;
  /** The shell's DATABASE_URL, else .env.local's, else the default; throws
   *  in a linked worktree with neither. */
  export function databaseUrl(env?: Record<string, string | undefined>, file?: string, root?: string): string;
  /** Throws when the URL names no database. */
  export function databaseName(url: string): string;
  /** The URL with any password masked. */
  export function redact(url: string): string;
}

declare module "*/scripts/db/migrations.mjs" {
  type Migration = { sql: string[]; folderMillis: number; hash: string };
  type MigrationState = {
    status: "current" | "behind" | "skipped" | "ahead" | "diverged";
    total: number;
    applied: number;
    missing: Migration[];
    skipped: Migration[];
    unknown: { hash: string; createdAt: number | null }[];
  };
  type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
  export function migrationsOnDisk(dir?: string): Migration[];
  export function describeMigrations(state: MigrationState): string;
  export function migrationState(query: Query, disk?: Migration[]): Promise<MigrationState>;
  export function applyMigrations(query: Query, disk?: Migration[]): Promise<{ before: MigrationState; applied: Migration[] }>;
}

declare module "*/scripts/tests/testdb.mjs" {
  /** A fresh, fully migrated in-process PGlite database for one test. */
  export function freshDb(): Promise<{
    db: import("../../scripts/db/players.ts").Db;
    client: unknown;
    query: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
    close: () => Promise<void>;
  }>;
}
