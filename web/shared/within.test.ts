import assert from "node:assert/strict";
import { test } from "node:test";
import { within } from "./within.ts";

const after = <T>(ms: number, value: T) => new Promise<T>((ok) => setTimeout(() => ok(value), ms));

test("within: work that finishes in time is handed back, and its own failure is kept", async () => {
  assert.equal(await within(after(5, "done"), 1_000, "too slow"), "done");
  await assert.rejects(within(Promise.reject(new Error("no")), 1_000, "too slow"), /^Error: no$/);
  await assert.rejects(within(Promise.reject("a string"), 1_000, "too slow"), /^Error: a string$/);
});

test("within: work that never finishes fails with the message when the time is up", async () => {
  const started = performance.now();
  await assert.rejects(within(new Promise<never>(() => {}), 30, "too slow"), /^Error: too slow$/);
  assert.ok(performance.now() - started < 1_000);
});

test("within: work that finishes after the time is up changes nothing", async () => {
  const late = after(60, "late");
  await assert.rejects(within(late, 10, "too slow"), /^Error: too slow$/);
  assert.equal(await late, "late");
});
