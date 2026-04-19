import path from "node:path";
import { createClient } from "./bot/client.js";
import { registerMessageRouter } from "./bot/messageRouter.js";
import { loadEnvFile } from "./config/loadEnvFile.js";
import { parseExcludedPlayerPhone } from "./bot/whatsappIdentity.js";
import { GroupConfigStore } from "./storage/groupConfigStore.js";
import { GameStateStore } from "./storage/gameStateStore.js";

loadEnvFile();

async function main(): Promise<void> {
  const authDir = process.env.AUTH_DIR ?? path.join(process.cwd(), "auth");
  const dataDir = path.join(process.cwd(), "data");
  const excludedPhoneDigits = parseExcludedPlayerPhone(process.env.EXCLUDED_PLAYER_PHONE);
  const sock = await createClient(authDir);

  const configStore = new GroupConfigStore(dataDir);
  const gameStore = new GameStateStore(dataDir);

  registerMessageRouter({
    sock,
    dataDir,
    configStore,
    gameStore,
    ...(excludedPhoneDigits !== undefined ? { excludedPhoneDigits } : {}),
  });
}

main().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
