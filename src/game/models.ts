export type Difficulty = "easy" | "medium" | "hard" | "mixed";

export type GroupConfig = {
  category: string;
  difficulty: Difficulty;
  hintEnabled: boolean;
  impostorCount: number;
};

export type WordBank = Record<string, Record<Exclude<Difficulty, "mixed">, string[]>>;

export type LobbyPlayer = {
  jid: string;
  joinedAt: number;
};

export type GamePhase = "idle" | "lobby" | "started";

export type GroupGameState = {
  groupJid: string;
  phase: GamePhase;
  players: LobbyPlayer[];
  impostors: string[];
  secretWord?: string;
  category?: string;
  difficulty?: Difficulty;
  createdAt: number;
};

export type GroupConfigMap = Record<string, GroupConfig>;
export type GroupGameStateMap = Record<string, GroupGameState>;
