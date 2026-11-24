#!/usr/bin/env node
// npm run pin:reset   forget the grown-up PIN
//
// For a PIN nobody remembers. The next visit to the Grown-ups screen, in
// this Mac's own browser, asks for a new one. Nothing else changes: tickets,
// prizes and players stay.
// Only someone at this Mac can run it, which is the point.

import pg from "pg";
import { databaseUrl, redact } from "./config.mjs";

const url = databaseUrl();
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  const { rowCount } = await client.query("delete from settings where key = 'grownup_pin'");
  console.log(`database: ${redact(url)}`);
  console.log(rowCount ? "The grown-up PIN is forgotten. On this Mac, open http://localhost:38900 and go to Grown-ups to choose a new one." : "There was no grown-up PIN to forget.");
} catch (e) {
  console.error(`pin reset failed: ${e?.message || e}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
