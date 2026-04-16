import fs from "node:fs";
import path from "node:path";
import type { Difficulty, WordBank } from "./models.js";

const TIERS: Exclude<Difficulty, "mixed">[] = ["easy", "medium", "hard"];

export function loadWordBank(dataDir: string): WordBank {
  const file = path.join(dataDir, "wordbank.json");
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw) as WordBank;
}

export function listCategories(bank: WordBank): string[] {
  return Object.keys(bank).sort();
}

export function pickWord(
  bank: WordBank,
  category: string,
  difficulty: Difficulty,
): { resolvedCategory: string; word: string } {
  const categories = listCategories(bank);
  const resolvedCategory =
    category === "random" ? categories[Math.floor(Math.random() * categories.length)] : category;

  if (!resolvedCategory || !bank[resolvedCategory]) {
    throw new Error("Unknown category");
  }

  const bucket = bank[resolvedCategory];
  const pool =
    difficulty === "mixed"
      ? TIERS.flatMap((tier) => bucket[tier] ?? [])
      : (bucket[difficulty] ?? []);

  if (pool.length === 0) {
    throw new Error("No words available for selected filters");
  }

  return {
    resolvedCategory,
    word: pool[Math.floor(Math.random() * pool.length)]!,
  };
}

export function createHint(word: string): string {
  if (word.length < 3) return `${word[0] ?? ""}_`;
  return `${word[0]}${"_".repeat(Math.max(1, word.length - 2))}${word[word.length - 1]}`;
}
