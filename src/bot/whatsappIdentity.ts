import {
  areJidsSameUser,
  jidDecode,
  jidNormalizedUser,
  type GroupParticipant,
  type WASocket,
} from "@whiskeysockets/baileys";

export type GroupParticipantRow = {
  jid: string;
  displayName: string;
};

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** WhatsApp number as digits only, e.g. `5493484239630`. Empty/invalid → undefined. */
export function parseExcludedPlayerPhone(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const d = digitsOnly(raw);
  return d.length > 0 ? d : undefined;
}

function jidUserPhoneDigits(jid: string): string {
  const decoded = jidDecode(jidNormalizedUser(jid));
  if (!decoded?.user) return "";
  return digitsOnly(decoded.user);
}

/** True if this group member should be ignored for the game (same human as configured phone). */
export async function participantExcludedByPhone(
  sock: WASocket,
  excludedDigits: string | undefined,
  participant: GroupParticipant,
  normalizedParticipantJid: string,
): Promise<boolean> {
  if (!excludedDigits) return false;
  if (participant.phoneNumber) {
    const p = jidUserPhoneDigits(jidNormalizedUser(participant.phoneNumber));
    if (p && p === excludedDigits) return true;
  }
  if (jidUserPhoneDigits(normalizedParticipantJid) === excludedDigits) return true;
  const pnFromLid = await sock.signalRepository.lidMapping.getPNForLID(normalizedParticipantJid);
  if (pnFromLid && jidUserPhoneDigits(pnFromLid) === excludedDigits) return true;
  return false;
}

export function participantDisplayName(participant: GroupParticipant, normalizedJid: string): string {
  const notify = participant.notify?.trim();
  const saved = participant.name?.trim();
  if (notify) return notify;
  if (saved) return saved;
  if (participant.phoneNumber) {
    const pn = jidNormalizedUser(participant.phoneNumber);
    const at = pn.indexOf("@");
    if (at > 0) return pn.slice(0, at);
  }
  const at = normalizedJid.indexOf("@");
  const user = at > 0 ? normalizedJid.slice(0, at) : normalizedJid;
  if (user && !user.includes(":")) return user;
  return "Miembro del grupo";
}

/**
 * Private-chat JIDs and group participant JIDs may differ (PN vs LID). Resolve via Baileys LID mapping.
 */
export async function jidMatchesPrivOptIn(
  sock: WASocket,
  opted: ReadonlySet<string>,
  participantJid: string,
): Promise<boolean> {
  const candidate = jidNormalizedUser(participantJid);
  if (opted.has(participantJid) || opted.has(candidate)) return true;
  for (const o of opted) {
    const on = jidNormalizedUser(o);
    if (on === candidate) return true;
    if (areJidsSameUser(o, participantJid)) return true;
  }

  const pnFromLid = await sock.signalRepository.lidMapping.getPNForLID(participantJid);
  if (pnFromLid) {
    const pNorm = jidNormalizedUser(pnFromLid);
    for (const o of opted) {
      if (jidNormalizedUser(o) === pNorm) return true;
      if (areJidsSameUser(o, pnFromLid)) return true;
    }
  }

  const lidBatch = await sock.signalRepository.lidMapping.getLIDsForPNs([participantJid]);
  const lid = lidBatch?.[0]?.lid;
  if (lid) {
    const lNorm = jidNormalizedUser(lid);
    for (const o of opted) {
      if (jidNormalizedUser(o) === lNorm) return true;
      if (areJidsSameUser(o, lid)) return true;
    }
  }

  return false;
}
