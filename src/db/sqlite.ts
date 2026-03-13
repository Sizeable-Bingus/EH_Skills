import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

import { SCHEMA } from "./schema.ts";

export function openReadOnlyDatabase(dbPath: string): Database {
  return new Database(dbPath, { readonly: true });
}

export function openWritableDatabase(dbPath: string): Database {
  return new Database(dbPath, { create: true });
}

export function ensureSchema(db: Database): void {
  db.exec(SCHEMA);
  ensureColumn(db, "findings", "name", "TEXT");
}

function ensureColumn(
  db: Database,
  table: string,
  column: string,
  columnType: string,
): void {
  const columns = db.query(`PRAGMA table_info(${table})`).all() as Array<{
    name?: string;
  }>;

  if (columns.some((entry) => entry.name === column)) {
    return;
  }

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${columnType}`);
}

export function withReadOnlyDatabase<T>(
  dbPath: string,
  callback: (db: Database) => T,
): T {
  if (!existsSync(dbPath)) {
    throw new Error(`Database does not exist: ${dbPath}`);
  }
  const db = openReadOnlyDatabase(dbPath);
  try {
    return callback(db);
  } finally {
    db.close();
  }
}

export function withWritableDatabase<T>(
  dbPath: string,
  callback: (db: Database) => T,
): T {
  const db = openWritableDatabase(dbPath);
  try {
    ensureSchema(db);
    return callback(db);
  } finally {
    db.close();
  }
}
