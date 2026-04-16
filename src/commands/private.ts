type Context = {
  senderJid: string;
  sendPrivate: (jid: string, text: string) => Promise<void>;
};

export async function handlePrivateCommand(message: string, ctx: Context): Promise<boolean> {
  const text = message.trim();
  const lowered = text.toLowerCase();
  if (lowered === "help") {
    await ctx.sendPrivate(
      ctx.senderJid,
      [
        "Comandos privados:",
        "listo - confirmar que puedo enviarte rol por privado",
        "help - mostrar esta ayuda",
        "",
        "Para jugar: en el grupo usen !impostor start.",
      ].join("\n"),
    );
    return true;
  }

  if (lowered === "listo" || lowered === "ready" || lowered === "hola" || lowered === "hi") {
    await ctx.sendPrivate(
      ctx.senderJid,
      "Perfecto. Ya te tengo habilitado para recibir rol y palabra por privado.",
    );
    return true;
  }

  return false;
}
