import path from "node:path";
import { JsonStore } from "./jsonStore.js";
import type { GroupConfig, GroupConfigMap } from "../game/models.js";

const DEFAULT_CONFIG: GroupConfig = {
  category: "random",
  difficulty: "mixed",
  hintEnabled: false,
  impostorCount: 1,
};

export class GroupConfigStore {
  private readonly store: JsonStore<GroupConfigMap>;

  constructor(dataDir: string) {
    this.store = new JsonStore<GroupConfigMap>(path.join(dataDir, "group-config.json"), {});
  }

  get(groupJid: string): GroupConfig {
    const map = this.store.read();
    return map[groupJid] ?? DEFAULT_CONFIG;
  }

  set(groupJid: string, config: GroupConfig): GroupConfig {
    this.store.update((current) => ({ ...current, [groupJid]: config }));
    return config;
  }

  update(groupJid: string, partial: Partial<GroupConfig>): GroupConfig {
    const current = this.get(groupJid);
    const next = { ...current, ...partial };
    this.set(groupJid, next);
    return next;
  }
}
