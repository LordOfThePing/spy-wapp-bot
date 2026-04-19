import makeWASocket, { fetchLatestBaileysVersion, useMultiFileAuthState } from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

export async function createClient(authDir: string) {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    logger: pino({ level: "warn" }),
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", ({ connection, qr }) => {
    if (qr) {
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      console.warn("Connection closed. Exiting process so Docker can restart cleanly.");
      setImmediate(() => process.exit(1));
    }
  });

  return sock;
}
