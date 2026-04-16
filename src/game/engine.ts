import { createHint, loadWordBank, pickWord } from "./wordSelector.js";
import type { GroupConfig, GroupGameState } from "./models.js";
import { validateImpostorCount } from "./validators.js";

export function buildLobby(groupJid: string): GroupGameState {
  return {
    groupJid,
    phase: "lobby",
    players: [],
    impostors: [],
    createdAt: Date.now(),
  };
}

export function addPlayer(state: GroupGameState, jid: string): GroupGameState {
  if (state.players.some((player) => player.jid === jid)) return state;
  return {
    ...state,
    players: [...state.players, { jid, joinedAt: Date.now() }],
  };
}

export function startRound(args: {
  state: GroupGameState;
  config: GroupConfig;
  dataDir: string;
}): GroupGameState {
  const { state, config, dataDir } = args;

  if (state.players.length < 3) {
    throw new Error("Se necesitan al menos 3 jugadores para iniciar.");
  }
  validateImpostorCount(config.impostorCount, state.players.length);

  const bank = loadWordBank(dataDir);
  const { resolvedCategory, word } = pickWord(bank, config.category, config.difficulty);
  const shuffled = [...state.players].sort(() => Math.random() - 0.5);
  const impostors = shuffled.slice(0, config.impostorCount).map((p) => p.jid);

  return {
    ...state,
    phase: "started",
    category: resolvedCategory,
    difficulty: config.difficulty,
    secretWord: word,
    impostors,
  };
}

export function createImpostorMessage(secretWord: string, withHint: boolean): string {
  const hintLine = withHint ? `Pista: ${createHint(secretWord)}` : "Pista: desactivada";
  return ["Rol: IMPOSTOR", "Mezclate con el grupo y evita sospechas.", hintLine].join("\n");
}

export function createCitizenMessage(secretWord: string, category: string): string {
  return [
    "Rol: CIVIL",
    `Categoria: ${category}`,
    `Palabra secreta: ${secretWord}`,
    "Deci algo relacionado sin revelar la palabra exacta.",
  ].join("\n");
}

export function getJoinCount(state: GroupGameState): number {
  return state.players.length;
}

