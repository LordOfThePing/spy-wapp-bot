import { isLidUser } from "@whiskeysockets/baileys";
import { z } from "zod";
import type { GroupParticipantRow } from "../bot/whatsappIdentity.js";
import { createCitizenMessage, createImpostorMessage, startRound } from "../game/engine.js";
import { listCategories, loadWordBank } from "../game/wordSelector.js";
import type { GroupConfigStore } from "../storage/groupConfigStore.js";
import type { GameStateStore } from "../storage/gameStateStore.js";
import type { Difficulty, GroupGameState } from "../game/models.js";

const AGENT_DEBUG_INGEST =
  process.env.DEBUG_INGEST_URL ??
  "http://127.0.0.1:7745/ingest/bcf066ba-7811-40ec-ac81-1b79d518da24";

type Context = {
  groupJid: string;
  dataDir: string;
  senderJid: string;
  isOptedIn: (jid: string) => Promise<boolean>;
  configStore: GroupConfigStore;
  gameStore: GameStateStore;
  getGroupParticipants: () => Promise<GroupParticipantRow[]>;
  sendGroup: (text: string) => Promise<void>;
  sendPrivate: (jid: string, text: string) => Promise<void>;
};

const difficultySchema = z.enum(["easy", "medium", "hard", "mixed"]);
const switchSchema = z.enum(["on", "off"]);

export async function handleGroupCommand(commandLine: string, ctx: Context): Promise<boolean> {
  const args = commandLine.trim().split(/\s+/);
  if (args[0] !== "!impostor") return false;
  const sub = args[1]?.toLowerCase();

  if (!sub || sub === "menu") {
    const config = ctx.configStore.get(ctx.groupJid);
    await ctx.sendGroup(
      [
        "Menu de impostor",
        `Categoria: ${config.category}`,
        `Dificultad: ${config.difficulty}`,
        `Pista para impostor: ${config.hintEnabled ? "on" : "off"}`,
        `Cantidad de impostores: ${config.impostorCount}`,
        "",
        "Comandos:",
        "!impostor set category <nombre|random>",
        "!impostor set difficulty <easy|medium|hard|mixed>",
        "!impostor set hint <on|off>",
        "!impostor set impostors <numero>",
        "!impostor start",
        "!impostor reset",
      ].join("\n"),
    );
    return true;
  }

  if (sub === "set") {
    const key = args[2]?.toLowerCase();
    const value = args.slice(3).join(" ").trim().toLowerCase();
    const current = ctx.configStore.get(ctx.groupJid);

    if (key === "category") {
      const categories = listCategories(loadWordBank(ctx.dataDir));
      if (value !== "random" && !categories.includes(value)) {
        await ctx.sendGroup(`Categoria desconocida. Disponibles: ${categories.join(", ")}`);
        return true;
      }
      ctx.configStore.update(ctx.groupJid, { category: value || "random" });
      await ctx.sendGroup(`Categoria actualizada a ${value || "random"}.`);
      return true;
    }

    if (key === "difficulty") {
      const parsed = difficultySchema.safeParse(value);
      if (!parsed.success) {
        await ctx.sendGroup("La dificultad debe ser easy, medium, hard o mixed.");
        return true;
      }
      ctx.configStore.update(ctx.groupJid, { difficulty: parsed.data as Difficulty });
      await ctx.sendGroup(`Dificultad actualizada a ${parsed.data}.`);
      return true;
    }

    if (key === "hint") {
      const parsed = switchSchema.safeParse(value);
      if (!parsed.success) {
        await ctx.sendGroup("La pista debe ser on o off.");
        return true;
      }
      ctx.configStore.update(ctx.groupJid, { hintEnabled: parsed.data === "on" });
      await ctx.sendGroup(`Pista actualizada a ${parsed.data}.`);
      return true;
    }

    if (key === "impostors") {
      const count = Number(value);
      if (!Number.isInteger(count) || count < 1) {
        await ctx.sendGroup("La cantidad de impostores debe ser un numero mayor o igual a 1.");
        return true;
      }
      ctx.configStore.update(ctx.groupJid, { impostorCount: count });
      await ctx.sendGroup(`Cantidad de impostores actualizada a ${count}.`);
      return true;
    }

    ctx.configStore.set(ctx.groupJid, current);
    await ctx.sendGroup("Parametro desconocido.");
    return true;
  }

  if (sub === "reset") {
    ctx.gameStore.remove(ctx.groupJid);
    await ctx.sendGroup("Partida reiniciada.");
    return true;
  }

  if (sub === "start") {
    const participants = await ctx.getGroupParticipants();
    if (participants.length < 3) {
      await ctx.sendGroup("Se necesitan al menos 3 jugadores humanos en el grupo.");
      return true;
    }

    const notOpted: GroupParticipantRow[] = [];
    for (const p of participants) {
      if (!(await ctx.isOptedIn(p.jid))) notOpted.push(p);
    }
    // #region agent log
    fetch(AGENT_DEBUG_INGEST, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2bff05" },
      body: JSON.stringify({
        sessionId: "2bff05",
        hypothesisId: "B",
        location: "group.ts:!impostor start",
        message: "opt-in gate summary",
        data: {
          participantCount: participants.length,
          notOptedCount: notOpted.length,
          lidParticipantCount: participants.filter((row) => isLidUser(row.jid)).length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (notOpted.length > 0) {
      const listado = notOpted.map((p) => `- ${p.displayName}`).join("\n");
      await ctx.sendGroup(
        [
          "Antes de iniciar, estos jugadores deben escribirle al bot por privado (ej: hola o listo):",
          listado,
          "",
          "Luego ejecuten de nuevo !impostor start.",
        ].join("\n"),
      );
      return true;
    }

    const baseState: GroupGameState = {
      groupJid: ctx.groupJid,
      phase: "lobby",
      players: participants.map((p) => ({ jid: p.jid, joinedAt: Date.now() })),
      impostors: [],
      createdAt: Date.now(),
    };

    try {
      const started = startRound({
        state: baseState,
        config: ctx.configStore.get(ctx.groupJid),
        dataDir: ctx.dataDir,
      });
      ctx.gameStore.upsert(ctx.groupJid, started);

      const config = ctx.configStore.get(ctx.groupJid);
      for (const player of started.players) {
        const text = started.impostors.includes(player.jid)
          ? createImpostorMessage(started.secretWord ?? "", config.hintEnabled)
          : createCitizenMessage(started.secretWord ?? "", started.category ?? "desconocida");
        await ctx.sendPrivate(player.jid, text);
      }

      await ctx.sendGroup("Ronda iniciada. Roles enviados por privado.");
    } catch (error) {
      await ctx.sendGroup((error as Error).message);
    }
    return true;
  }

  await ctx.sendGroup("Comando desconocido. Usa !impostor menu.");
  return true;
}
