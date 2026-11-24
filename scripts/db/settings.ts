// The arcade's own settings: the only code that reads or writes that table.
//
// Erasable TypeScript only, like schema.ts: `node --test` imports it as is.

import { eq, sql } from "drizzle-orm";
import type { Db } from "./players.ts";
import { settings } from "./schema.ts";

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`now()` } });
}
