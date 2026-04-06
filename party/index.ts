import type * as Party from "partykit/server";

// ── Types ──────────────────────────────────────────────────────────
interface Player {
  id: string;
  name: string;
  color: string;
  isTeacher: boolean;
}

interface Tile {
  id: number;
  x: number;
  y: number;
  owner: string | null;
  category: string;
}

interface Duel {
  challengerId: string;
  defenderId: string;
  tileId: number;
  category: string;
  active: string;
  questionIndices: number[];
  currentQIdx: number;
}

interface GameState {
  status: "waiting" | "input" | "playing" | "ended";
  players: Record<string, Player>;
  grid: Tile[];
  duel: Duel | null;
  inputProgress: Record<string, Record<string, number>>; // playerId -> { category: highestStep }
}

const COLORS = ["#00d4ff", "#ff4757", "#ffa502", "#2ed573", "#c44dff", "#ff6b81", "#eccc68", "#1e90ff"];
const CAT_KEYS = ["animals", "food", "sports", "jobs", "transport", "school"];

const makeGrid = (playerIds: string[]): Tile[] => {
  const tiles: Tile[] = [];
  for (let i = 0; i < 25; i++) {
    tiles.push({
      id: i,
      x: i % 5,
      y: Math.floor(i / 5),
      owner: null,
      category: CAT_KEYS[i % 6],
    });
  }
  const startPositions = [0, 1, 3, 4, 20, 21, 23, 24];
  playerIds.forEach((pid, idx) => {
    if (startPositions[idx] !== undefined) {
      tiles[startPositions[idx]].owner = pid;
    }
  });
  return tiles;
};

// ── Server ─────────────────────────────────────────────────────────
export default class WiseFloorParty implements Party.Server {
  state: GameState = {
    status: "waiting",
    players: {},
    grid: [],
    duel: null,
    inputProgress: {},
  };

  constructor(readonly room: Party.Room) {}

  broadcast(msg: object) {
    this.room.broadcast(JSON.stringify(msg));
  }

  onConnect(conn: Party.Connection) {
    conn.send(JSON.stringify({ type: "state", state: this.state }));
  }

  onClose(conn: Party.Connection) {
    if (this.state.players[conn.id]) {
      const name = this.state.players[conn.id].name;
      delete this.state.players[conn.id];
      this.state.grid = this.state.grid.map(t =>
        t.owner === conn.id ? { ...t, owner: null } : t
      );
      if (this.state.duel &&
        (this.state.duel.challengerId === conn.id || this.state.duel.defenderId === conn.id)) {
        this.state.duel = null;
      }
      delete this.state.inputProgress[conn.id];
      this.broadcast({ type: "state", state: this.state });
      this.broadcast({ type: "notify", msg: `${name} left the game.` });
    }
  }

  onMessage(msg: string, sender: Party.Connection) {
    const data = JSON.parse(msg);

    switch (data.type) {
      case "join": {
        const colorIdx = Object.keys(this.state.players).length % COLORS.length;
        this.state.players[sender.id] = {
          id: sender.id,
          name: data.name,
          color: COLORS[colorIdx],
          isTeacher: data.isTeacher || false,
        };
        this.broadcast({ type: "state", state: this.state });
        this.broadcast({ type: "notify", msg: `${data.name} joined!` });
        break;
      }

      // Teacher starts the INPUT (learning) phase
      case "start_input": {
        this.state.status = "input";
        this.state.inputProgress = {};
        this.broadcast({ type: "state", state: this.state });
        this.broadcast({ type: "notify", msg: "Learning time! Study the vocabulary." });
        break;
      }

      // Student completed a learning step for a category
      case "step_complete": {
        if (this.state.status !== "input") return;
        const { category: cat2, step } = data;
        if (!CAT_KEYS.includes(cat2)) return;
        if (!this.state.inputProgress[sender.id]) {
          this.state.inputProgress[sender.id] = {};
        }
        const current = this.state.inputProgress[sender.id][cat2] || 0;
        if (step > current) {
          this.state.inputProgress[sender.id][cat2] = step;
        }
        this.broadcast({ type: "state", state: this.state });
        break;
      }

      // Teacher starts the BATTLE phase (works from "waiting" or "input")
      case "start_game": {
        const playerIds = Object.keys(this.state.players)
          .filter(id => !this.state.players[id].isTeacher);
        if (playerIds.length < 2) {
          sender.send(JSON.stringify({ type: "error", msg: "Need at least 2 students." }));
          return;
        }
        this.state.status = "playing";
        this.state.grid = makeGrid(playerIds);
        this.state.duel = null;
        this.broadcast({ type: "state", state: this.state });
        this.broadcast({ type: "notify", msg: "Battle started! Tap an enemy tile to challenge." });
        break;
      }

      case "challenge": {
        if (this.state.status !== "playing") return;
        if (this.state.duel) return;

        const tile = this.state.grid.find(t => t.id === data.tileId);
        if (!tile || !tile.owner || tile.owner === sender.id) return;

        const myTiles = this.state.grid.filter(t => t.owner === sender.id);
        const isAdjacent = myTiles.some(
          mt => Math.abs(mt.x - tile.x) + Math.abs(mt.y - tile.y) === 1
        );
        if (!isAdjacent) return;

        this.state.duel = {
          challengerId: sender.id,
          defenderId: tile.owner,
          tileId: tile.id,
          category: tile.category,
          active: sender.id,
          questionIndices: data.questionIndices || [],
          currentQIdx: 0,
        };
        this.broadcast({ type: "state", state: this.state });
        this.broadcast({
          type: "duel_start",
          challenger: this.state.players[sender.id]?.name,
          defender: this.state.players[tile.owner]?.name,
          category: tile.category,
        });
        break;
      }

      // Teacher triggers switch on behalf of active player
      case "teacher_switch": {
        if (!this.state.duel) return;
        const senderPlayer = this.state.players[sender.id];
        if (!senderPlayer?.isTeacher) return;
        const activeId = this.state.duel.active;
        const other = activeId === this.state.duel.challengerId
          ? this.state.duel.defenderId
          : this.state.duel.challengerId;
        this.state.duel = {
          ...this.state.duel,
          active: other,
          currentQIdx: this.state.duel.currentQIdx + 1,
        };
        this.broadcast({ type: "state", state: this.state });
        break;
      }

      case "switch_turn": {
        if (!this.state.duel) return;
        if (this.state.duel.active !== sender.id) return;
        const other = this.state.duel.active === this.state.duel.challengerId
          ? this.state.duel.defenderId
          : this.state.duel.challengerId;
        this.state.duel = {
          ...this.state.duel,
          active: other,
          currentQIdx: this.state.duel.currentQIdx + 1,
        };
        this.broadcast({ type: "state", state: this.state });
        break;
      }

      case "duel_result": {
        if (!this.state.duel) return;
        const { winnerId, loserId, tileId } = data;
        this.state.grid = this.state.grid.map(t =>
          t.id === tileId ? { ...t, owner: winnerId } : t
        );
        const winnerName = this.state.players[winnerId]?.name;
        const loserName = this.state.players[loserId]?.name;
        this.state.duel = null;
        this.broadcast({ type: "state", state: this.state });
        this.broadcast({
          type: "duel_end",
          winnerId,
          loserId,
          tileId,
          msg: `${winnerName} defeated ${loserName} and claimed the tile!`,
        });
        const allOwned = this.state.grid.every(t => t.owner === winnerId);
        if (allOwned) {
          this.state.status = "ended";
          this.broadcast({ type: "game_over", winnerId, winnerName });
          this.broadcast({ type: "state", state: this.state });
        }
        break;
      }

      case "reset": {
        this.state = { status: "waiting", players: {}, grid: [], duel: null, inputProgress: {} };
        this.broadcast({ type: "state", state: this.state });
        break;
      }
    }
  }
}
