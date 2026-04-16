import { isJidGroup, jidNormalizedUser, proto, WASocket } from "@whiskeysockets/baileys";
import { CooldownManager } from "./cooldown.js";
import { handleGroupCommand } from "../commands/group.js";
import { handlePrivateCommand } from "../commands/private.js";
import type { GroupConfigStore } from "../storage/groupConfigStore.js";
import type { GameStateStore } from "../storage/gameStateStore.js";

type RouterDeps = {
  sock: WASocket;
  dataDir: string;
  configStore: GroupConfigStore;
  gameStore: GameStateStore;
};

export function registerMessageRouter(deps: RouterDeps): void {
  const { sock, dataDir, configStore, gameStore } = deps;
  const cooldown = new CooldownManager();
  const privateOptIn = new Set<string>();

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;

        const chatJid = msg.key.remoteJid;
        if (!chatJid) continue;
        const senderJid = resolveSenderJid(msg, chatJid);
        const text = getMessageText(msg);
        if (!text) continue;

        if (isJidGroup(chatJid)) {
          const groupBurst = cooldown.take(`g:${chatJid}`, 1200);
          if (groupBurst > 0) continue;
          const senderBurst = cooldown.take(`u:${chatJid}:${senderJid}`, 2500);
          if (senderBurst > 0) continue;

          await handleGroupCommand(text, {
            groupJid: chatJid,
            dataDir,
            senderJid,
            isOptedIn: (jid) => privateOptIn.has(jid),
            configStore,
            gameStore,
            getGroupParticipants: async () => {
              const metadata = await sock.groupMetadata(chatJid);
              const botJid = jidNormalizedUser(sock.user?.id ?? "");
              return metadata.participants
                .map((participant) => jidNormalizedUser(participant.id))
                .filter((jid) => jid !== botJid);
            },
            sendGroup: async (message) => {
              await sock.sendMessage(chatJid, { text: message });
            },
            sendPrivate: async (jid, message) => {
              await sock.sendMessage(jid, { text: message });
            },
          });
        } else {
          const dmTargetJid = resolvePrivateReplyJid(chatJid, senderJid);
          privateOptIn.add(dmTargetJid);
          const dmBurst = cooldown.take(`dm:${dmTargetJid}`, 1500);
          if (dmBurst > 0) continue;

          const handled = await handlePrivateCommand(text, {
            senderJid: dmTargetJid,
            sendPrivate: async (_jid, message) => {
              await sock.sendMessage(dmTargetJid, { text: message });
            },
          });
          if (!handled) {
            await sock.sendMessage(chatJid, { text: 'Comando privado desconocido. Envia "help".' });
          }
        }
      } catch (error) {
        console.error("Error handling incoming message:", error);
      }
    }
  });
}

function resolveSenderJid(msg: proto.IWebMessageInfo, chatJid: string): string {
  const participant = msg.key?.participant;
  if (participant) {
    const normalizedParticipant = jidNormalizedUser(participant);
    if (normalizedParticipant) return normalizedParticipant;
    return participant;
  }
  const normalizedChat = jidNormalizedUser(chatJid);
  return normalizedChat || chatJid;
}

function resolvePrivateReplyJid(chatJid: string, senderJid: string): string {
  return senderJid || chatJid;
}

function getMessageText(msg: proto.IWebMessageInfo): string | null {
  const payload = msg.message;
  if (!payload) return null;
  return (
    payload.conversation ??
    payload.extendedTextMessage?.text ??
    payload.imageMessage?.caption ??
    payload.videoMessage?.caption ??
    null
  );
}
