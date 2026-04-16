import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createHint, loadWordBank, pickWord } from "../game/wordSelector.js";

const dataDir = path.join(process.cwd(), "data");

test("pickWord supports mixed difficulty", () => {
  const bank = loadWordBank(dataDir);
  const picked = pickWord(bank, "movies", "mixed");
  assert.equal(picked.resolvedCategory, "movies");
  assert.ok(picked.word.length > 0);
});

test("createHint masks middle letters", () => {
  const hint = createHint("cinematography");
  assert.match(hint, /^c_+y$/);
});
