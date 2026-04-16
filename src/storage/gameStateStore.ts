import path from "node:path";
import { JsonStore } from "./jsonStore.js";
import type { GroupGameState, GroupGameStateMap } from "../game/models.js";

export class GameStateStore {
  private readonly store: JsonStore<GroupGameStateMap>;

  constructor(dataDir: string) {
    this.store = new JsonStore<GroupGameStateMap>(path.join(dataDir, "game-state.json"), {});
  }

  get(groupJid: string): GroupGameState | undefined {
    const map = this.store.read();
    return map[groupJid];
  }

  getAll(): GroupGameStateMap {
    return this.store.read();
  }

  upsert(groupJid: string, state: GroupGameState): GroupGameState {
    this.store.update((current) => ({ ...current, [groupJid]: state }));
    return state;
  }

  remove(groupJid: string): void {
    this.store.update((current) => {
      const next = { ...current };
      delete next[groupJid];
      return next;
    });
  }
}
