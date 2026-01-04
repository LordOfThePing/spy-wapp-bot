import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidGroup,
  jidNormalizedUser,
  proto,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import path from "path";
import qrcode from "qrcode-terminal";

type GameState = {
  status: "idle" | "setup" | "started";
  category?: string;
  word?: string;
  spyJid?: string;
  roundId?: string;
  startedAt?: number;
};

const logger = pino({ level: "info" });
const prettyLogger = pino({ level: "warn" }, pino.transport({ target: "pino-pretty" }));

const DATA_DIR = path.join(process.cwd(), "data");
const WORDBANK_PATH = path.join(DATA_DIR, "wordbank.json");

// In-memory state
const groupStates = new Map<string, GameState>();

// Anti-spam: cooldowns
const groupCooldowns = new Map<string, number>(); // key: `${groupId}:${cmd}`
const userCooldowns = new Map<string, number>(); // key: `${groupId}:${userId}:${cmd}`

// Opt-in: user must DM bot at least once to receive role DMs
const globalOptIn = new Set<string>(); // user JIDs

// Safety knobs (tune as you like)
const MAX_PLAYERS_PER_ROUND = 12;
const DM_DELAY_MIN_MS = 2000;
const DM_DELAY_MAX_MS = 5000;

function now() {
  return Date.now();
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function randInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** Returns remaining ms if still cooling down, otherwise 0 and records new timestamp. */
function takeCooldown(map: Map<string, number>, key: string, cooldownMs: number): number {
  const last = map.get(key) ?? 0;
  const elapsed = now() - last;
  if (elapsed < cooldownMs) return cooldownMs - elapsed;
  map.set(key, now());
  return 0;
}

function loadWordbank(): Record<string, string[]> {
  const raw = fs.readFileSync(WORDBANK_PATH, "utf-8");
  return JSON.parse(raw);
}

function pickRandom<T>(arr: T[]): T {
  if (arr.length === 0) throw new Error("pickRandom() called with empty array");
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function normalizeText(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function parseCommand(text: string) {
  const t = normalizeText(text);
  if (!t.startsWith("/")) return null;

  const parts = t.split(" ").filter(Boolean);
  const cmd = parts[0];
  const args = parts.slice(1);

  if (!cmd) return null;
  return { cmd: cmd.toLowerCase(), args };
}

// Best-effort message text extraction
function getMessageText(msg: proto.IWebMessageInfo): string | null {
  const m = msg.message;
  if (!m) return null;

  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;

  return null;
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(WORDBANK_PATH)) {
    throw new Error(`Missing wordbank at ${WORDBANK_PATH}. Create data/wordbank.json`);
  }

  // ✅ Persist auth wherever you want (Railway volume: mount /data then set AUTH_DIR=/data/auth_info)
  const AUTH_DIR = process.env.AUTH_DIR || "auth";

  // OPTIONAL: only wipe when explicitly requested
  if (process.env.RESET_AUTH === "true") {
    console.log("🧹 RESET_AUTH=true → deleting auth directory");

    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    logger: prettyLogger,
  });

  sock.ev.on("creds.update", saveCreds);

  const USE_PAIRING = (process.env.PAIRING || "").toLowerCase() === "true";
  const PHONE_NUMBER = (process.env.PHONE_NUMBER || "").replace(/\D/g, "");

  if (USE_PAIRING && !sock.authState.creds.registered) {
    if (!PHONE_NUMBER) {
      console.error("❌ PAIRING=true but PHONE_NUMBER is missing.");
    } else {
      requestPairingCodeSafely(sock, PHONE_NUMBER).catch((e) => console.error(e));
    }
  }
  let pairingRequested = false;

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // If not using pairing (or as fallback), show QR
    if (!USE_PAIRING && qr) {
      console.log("\nScan this QR with WhatsApp (Linked Devices):\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        console.error(`Logged out. Delete ${AUTH_DIR}/ and re-link.`);
      } else {
        console.warn(`Connection closed (status ${statusCode ?? "?"}). Reconnecting...`);
        main().catch(console.error);
      }
    }


    if (connection === "open") {
      const me = sock.user?.id;
      console.log("✅ Connected as:", me);
      console.log("📱 Number:", me?.split("@")[0]);
      console.log("Tip: Players must DM the bot once (say 'hi') to opt-in for DMs.");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue;

        const chatJid = msg.key.remoteJid;
        if (!chatJid) continue;

        const text = getMessageText(msg);
        if (!text) continue;

        // Determine sender (participant exists for group messages)
        const senderJid = jidNormalizedUser(msg.key.participant ?? chatJid);

        // --- Private chat: record opt-in ---
        if (!isJidGroup(chatJid)) {
          globalOptIn.add(senderJid);

          // Keep it quiet: only acknowledge if they said "hi" or "/join"
          const t = normalizeText(text).toLowerCase();
          if (t === "hi" || t === "hello" || t === "/join") {
            await sock.sendMessage(chatJid, {
              text: "✅ You’re opted-in. Go back to the group and run /start.",
            });
          }
          continue;
        }

        // --- Group chat: handle commands only ---
        const parsed = parseCommand(text);
        if (!parsed) continue;

        const { cmd, args } = parsed;

        // Group-level cooldowns
        const groupKey = `${chatJid}:${cmd}`;
        const groupWait =
          cmd === "/start"
            ? takeCooldown(groupCooldowns, groupKey, 60_000)
            : cmd === "/setup"
              ? takeCooldown(groupCooldowns, groupKey, 10_000)
              : cmd === "/help"
                ? takeCooldown(groupCooldowns, groupKey, 10_000)
                : 0;

        if (groupWait > 0) {
          await sock.sendMessage(chatJid, {
            text: `⏳ Cooldown: try again in ${Math.ceil(groupWait / 1000)}s.`,
          });
          continue;
        }

        // Per-user cooldowns (mainly for /start)
        const userKey = `${chatJid}:${senderJid}:${cmd}`;
        const userWait = cmd === "/start" ? takeCooldown(userCooldowns, userKey, 30_000) : 0;
        if (userWait > 0) {
          // silent ignore is safest
          continue;
        }

        // Initialize group state if missing
        const state = groupStates.get(chatJid) ?? { status: "idle" as const };
        groupStates.set(chatJid, state);

        if (cmd === "/help") {
          await sock.sendMessage(chatJid, {
            text: [
              "🕵️ Spy Bot commands:",
              "/setup <category>  — choose a random word from category",
              "/start             — DM roles to participants (1 spy)",
              "/reset             — clear current round",
              "",
              "Important: each player must DM the bot once (say 'hi') so the bot can DM them back.",
              "Example: /setup football",
            ].join("\n"),
          });
          continue;
        }

        if (cmd === "/reset") {
          groupStates.set(chatJid, { status: "idle" });
          await sock.sendMessage(chatJid, { text: "✅ Reset done. Use /setup <category>." });
          continue;
        }

        if (cmd === "/setup") {
          if (args.length < 1) {
            await sock.sendMessage(chatJid, { text: "Usage: /setup <category> (example: /setup football)" });
            continue;
          }
          const category = args.join(" ").toLowerCase();
          const wordbank = loadWordbank();

          const words = wordbank[category];
          if (!words || words.length === 0) {
            const available = Object.keys(wordbank).sort().join(", ");
            await sock.sendMessage(chatJid, {
              text: `❌ Unknown/empty category: "${category}". Available: ${available}`,
            });
            continue;
          }

          const word = pickRandom(words);
          groupStates.set(chatJid, { status: "setup", category, word });

          await sock.sendMessage(chatJid, { text: `✅ Category set to "${category}". Ready! Send /start to begin.` });
          continue;
        }

        if (cmd === "/start") {
          const current = groupStates.get(chatJid);

          if (!current || current.status === "idle" || !current.category || !current.word) {
            await sock.sendMessage(chatJid, { text: "❌ First do /setup <category>." });
            continue;
          }
          if (current.status === "started") {
            await sock.sendMessage(chatJid, { text: "⚠️ A round is already running. Use /reset to start over." });
            continue;
          }

          const meta = await sock.groupMetadata(chatJid);

          const botJid = jidNormalizedUser(sock.user?.id ?? "");
          const allParticipants = meta.participants.map((p) => jidNormalizedUser(p.id));
          const players = allParticipants.filter((jid) => jid && jid !== botJid);

          if (players.length < 3) {
            await sock.sendMessage(chatJid, { text: "❌ Need at least 3 human players in the group." });
            continue;
          }

          if (players.length > MAX_PLAYERS_PER_ROUND) {
            await sock.sendMessage(chatJid, {
              text: `❌ Too many players (${players.length}). For safety, max is ${MAX_PLAYERS_PER_ROUND}. Split into smaller groups.`,
            });
            continue;
          }

          // Opt-in check
          const notOpted = players.filter((p) => !globalOptIn.has(p));
          if (notOpted.length > 0) {
            await sock.sendMessage(chatJid, {
              text:
                `⚠️ Some players must DM me first (say "hi") so I can DM them roles:\n` +
                notOpted.map((j) => `- @${j.split("@")[0]}`).join("\n") +
                `\n\nAfter they DM me, run /start again.`,
              mentions: notOpted,
            });
            continue;
          }

          const spyJid = pickRandom(players);
          const roundId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

          groupStates.set(chatJid, {
            status: "started",
            category: current.category,
            word: current.word,
            spyJid,
            roundId,
            startedAt: Date.now(),
          });

          // Slow DM sending (anti-spam)
          const failures: string[] = [];
          for (const pJid of players) {
            await sleep(randInt(DM_DELAY_MIN_MS, DM_DELAY_MAX_MS));

            try {
              if (pJid === spyJid) {
                await sock.sendMessage(pJid, {
                  text: `🕵️ You are the SPY!\nCategory: ${current.category}\n\nTry to blend in.`,
                });
              } else {
                await sock.sendMessage(pJid, {
                  text: `🎯 Your secret word is: ${current.word}\nCategory: ${current.category}\n\nDon’t reveal it directly.`,
                });
              }
            } catch {
              failures.push(pJid);
            }
          }

          const base = "✅ Roles sent in private DMs. Start the round!";
          if (failures.length > 0) {
            await sock.sendMessage(chatJid, {
              text:
                base +
                `\n\n⚠️ I could not DM ${failures.length} player(s). They may need to DM me again (say "hi").\n` +
                failures.map((j) => `- @${j.split("@")[0]}`).join("\n"),
              mentions: failures,
            });
          } else {
            await sock.sendMessage(chatJid, { text: base });
          }

          continue;
        }

        // Unknown command
        await sock.sendMessage(chatJid, { text: `Unknown command: ${cmd}. Try /help` });
      } catch (err) {
        logger.error({ err }, "Handler error");
      }
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function requestPairingCodeSafely(sock: any, phone: string) {
  // Wait for the connection to be open
  await sock.waitForConnectionUpdate((u: any) => u.connection === "open");

  // Give WA a moment (prevents 428 on some hosts)
  await sleep(2500);

  // Retry a few times if WA closes the connection
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const code = await sock.requestPairingCode(phone);
      console.log("\n🔗 Pairing code (WhatsApp → Linked devices → Link with phone number):");
      console.log("PAIRING CODE:", code, "\n");
      return;
    } catch (err: any) {
      const status = err?.output?.statusCode;
      console.error(`❌ Pairing attempt ${attempt} failed (status ${status ?? "?"}).`);

      // If socket got closed, wait a bit and let reconnection happen
      await sleep(3000);
    }
  }

  throw new Error("Could not get pairing code after multiple attempts.");
}
