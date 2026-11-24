import assert from "node:assert/strict";
import { test } from "node:test";
import { newRoundId, type RandomSource } from "./roundid.ts";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("a round id is a version 4 UUID, and no two are the same", () => {
  const ids = Array.from({ length: 200 }, () => newRoundId());
  for (const id of ids) assert.match(id, V4);
  assert.equal(new Set(ids).size, ids.length);
});

test("over plain http, where there is no randomUUID, it is made from getRandomValues", () => {
  const plain: RandomSource = { getRandomValues: (into) => crypto.getRandomValues(into) };
  const ids = Array.from({ length: 200 }, () => newRoundId(plain));
  for (const id of ids) assert.match(id, V4);
  assert.equal(new Set(ids).size, ids.length);
  const fill = (n: number): RandomSource => ({ getRandomValues: (into) => into.fill(n) });
  assert.equal(newRoundId(fill(0x00)), "00000000-0000-4000-8000-000000000000", "leading zeros are kept");
  assert.equal(newRoundId(fill(0xff)), "ffffffff-ffff-4fff-bfff-ffffffffffff");
});
