import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { addPlayer, buildLobby, startRound } from "../src/game/engine.js";
const dataDir = path.join(process.cwd(), "data");
test("startRound assigns configured number of impostors", () => {
    let lobby = buildLobby("group-1");
    lobby = addPlayer(lobby, "a@s.whatsapp.net");
    lobby = addPlayer(lobby, "b@s.whatsapp.net");
    lobby = addPlayer(lobby, "c@s.whatsapp.net");
    lobby = addPlayer(lobby, "d@s.whatsapp.net");
    const started = startRound({
        state: lobby,
        config: {
            category: "sports",
            difficulty: "easy",
            hintEnabled: false,
            impostorCount: 2,
        },
        dataDir,
    });
    assert.equal(started.phase, "started");
    assert.equal(started.impostors.length, 2);
    assert.ok(started.secretWord);
});
test("startRound rejects invalid impostor count", () => {
    let lobby = buildLobby("group-2");
    lobby = addPlayer(lobby, "a@s.whatsapp.net");
    lobby = addPlayer(lobby, "b@s.whatsapp.net");
    lobby = addPlayer(lobby, "c@s.whatsapp.net");
    assert.throws(() => startRound({
        state: lobby,
        config: {
            category: "sports",
            difficulty: "easy",
            hintEnabled: false,
            impostorCount: 3,
        },
        dataDir,
    }), /less than player count/);
});
//# sourceMappingURL=game-engine.test.js.map