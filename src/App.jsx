import { useState, useEffect, useRef, useCallback } from "react";
import usePartySocket from "partysocket/react";

// ── QUESTION DATA ──────────────────────────────────────────────────
const makeQ = (cat, name) => ({ img: `/images/${cat}/${name}.jpg`, answer: name });
const QDB = {
  animals:   ["elephant","giraffe","penguin","lion","dolphin","fox","bear","eagle","crocodile","zebra"].map(n => makeQ("animals", n)),
  food:      ["pizza","sushi","taco","avocado","noodles","steak","donut","croissant","waffle","blueberry"].map(n => makeQ("food", n)),
  sports:    ["baseball","basketball","tennis","soccer","swimming","boxing","surfing","gymnastics","weightlifting","skiing"].map(n => makeQ("sports", n)),
  jobs:      ["doctor","chef","firefighter","teacher","pilot","scientist","programmer","police","artist","judge"].map(n => makeQ("jobs", n)),
  transport: ["airplane","train","ship","helicopter","scooter","bicycle","rocket","taxi","ufo","boat"].map(n => makeQ("transport", n)),
  school:    ["pencil","microscope","backpack","books","pen","notebook","ruler","folder","computer","telescope"].map(n => makeQ("school", n)),
};

const CATS = {
  animals:   { label: "Animals",   icon: "🐾", color: "#10b981" },
  food:      { label: "Food",      icon: "🍽️", color: "#f59e0b" },
  sports:    { label: "Sports",    icon: "⚽", color: "#3b82f6" },
  jobs:      { label: "Jobs",      icon: "💼", color: "#a855f7" },
  transport: { label: "Transport", icon: "🚌", color: "#ef4444" },
  school:    { label: "School",    icon: "📚", color: "#06b6d4" },
};

const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const adjacent = (a, b) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

const fmtTime = t =>
  `${Math.floor(t / 10).toString().padStart(2, "0")}.${t % 10}`;

const HOST = import.meta.env.VITE_PARTYKIT_HOST || "localhost:1999";

// ── Speech Recognition ─────────────────────────────────────────────
const SpeechRecognition = typeof window !== "undefined"
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;
const speechSupported = !!SpeechRecognition;

const checkSpeechMatch = (transcript, answer) => {
  const t = transcript.toLowerCase().trim();
  const a = answer.toLowerCase().trim();
  if (t === a) return true;
  // Handle articles: "an elephant" → "elephant"
  if (t.includes(a)) return true;
  // Handle plural/singular loose match
  if (a.endsWith("s") && t === a.slice(0, -1)) return true;
  if (t.endsWith("s") && t.slice(0, -1) === a) return true;
  return false;
};

// ── BGM Engine (Web Audio API) ─────────────────────────────────────
class GameBGM {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.masterGain = null;
    this.loopTimer = null;
  }

  start() {
    if (this.playing) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.10;
      this.masterGain.connect(this.ctx.destination);
      this.playing = true;
      this._scheduleLoop();
    } catch (e) {
      console.warn("BGM not supported:", e);
    }
  }

  _scheduleLoop() {
    if (!this.playing || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Chord progression: Cm - Ab - Eb - Bb (epic game feel)
    const chords = [
      [130.81, 155.56, 196.00], // Cm
      [103.83, 130.81, 155.56], // Ab
      [155.56, 196.00, 233.08], // Eb
      [116.54, 146.83, 174.61], // Bb
    ];

    // Melody (pentatonic, exciting pattern)
    const melodyNotes = [
      523.25, 587.33, 659.25, 783.99, 880.00, 783.99, 659.25, 587.33,
      523.25, 659.25, 783.99, 1046.50, 880.00, 783.99, 659.25, 523.25,
    ];

    const barDuration = 2.0;
    const totalDuration = barDuration * 4;

    for (let bar = 0; bar < 4; bar++) {
      const barStart = now + bar * barDuration;
      const chord = chords[bar];

      // Pad (warm filtered saw)
      chord.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        filter.type = "lowpass";
        filter.frequency.value = 600;
        filter.Q.value = 1;
        gain.gain.setValueAtTime(0, barStart);
        gain.gain.linearRampToValueAtTime(0.05, barStart + 0.2);
        gain.gain.linearRampToValueAtTime(0.03, barStart + barDuration - 0.05);
        gain.gain.linearRampToValueAtTime(0, barStart + barDuration);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(barStart);
        osc.stop(barStart + barDuration);
      });

      // Melody notes (4 per bar)
      for (let n = 0; n < 4; n++) {
        const noteTime = barStart + n * (barDuration / 4);
        const noteFreq = melodyNotes[bar * 4 + n];
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = noteFreq;
        gain.gain.setValueAtTime(0, noteTime);
        gain.gain.linearRampToValueAtTime(0.07, noteTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.4);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(noteTime);
        osc.stop(noteTime + 0.45);
      }

      // Kick-like pulse on beats 1 and 3
      [0, barDuration / 2].forEach(offset => {
        const kickTime = barStart + offset;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(150, kickTime);
        osc.frequency.exponentialRampToValueAtTime(40, kickTime + 0.15);
        gain.gain.setValueAtTime(0.12, kickTime);
        gain.gain.exponentialRampToValueAtTime(0.001, kickTime + 0.2);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(kickTime);
        osc.stop(kickTime + 0.25);
      });
    }

    this.loopTimer = setTimeout(() => this._scheduleLoop(), (totalDuration - 0.1) * 1000);
  }

  stop() {
    this.playing = false;
    clearTimeout(this.loopTimer);
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  setVolume(v) {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(0.3, v));
  }
}

const bgm = new GameBGM();

// ── APP ────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("join"); // join | floor | input | duel
  const [studyCategory, setStudyCategory] = useState(null);
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyRevealed, setStudyRevealed] = useState(false);
  const [studiedCategories, setStudiedCategories] = useState([]);
  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isTeacher, setIsTeacher] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [notification, setNotification] = useState(null);
  const [duelLocal, setDuelLocal] = useState(null);
  const [shake, setShake] = useState(false);
  const [listening, setListening] = useState(false);
  const [spokenText, setSpokenText] = useState("");
  const [bgmOn, setBgmOn] = useState(false);

  const notifTimeout = useRef(null);
  const timerRef = useRef(null);
  const inputRef = useRef(null);
  const resultReported = useRef(false);
  const recognitionRef = useRef(null);

  const showNotif = useCallback((msg) => {
    setNotification(msg);
    clearTimeout(notifTimeout.current);
    notifTimeout.current = setTimeout(() => setNotification(null), 3000);
  }, []);

  // ── BGM toggle ──────────────────────────────────────────────────
  const toggleBgm = useCallback(() => {
    if (bgmOn) {
      bgm.stop();
      setBgmOn(false);
    } else {
      bgm.start();
      setBgmOn(true);
    }
  }, [bgmOn]);

  // Stop BGM on unmount
  useEffect(() => {
    return () => bgm.stop();
  }, []);

  // ── PartySocket connection ──────────────────────────────────────
  const socket = usePartySocket({
    host: HOST,
    room: roomCode || "__waiting__",
    onOpen() {
      setMyId(socket.id);
    },
    onMessage(evt) {
      const msg = JSON.parse(evt.data);
      switch (msg.type) {
        case "state":
          setGameState(msg.state);
          if (msg.state.status === "waiting" && screen !== "join") {
            setScreen("floor");
            setDuelLocal(null);
          }
          if (msg.state.status === "input" && screen === "floor") {
            setScreen("input");
            setStudyCategory(null);
            setStudyIndex(0);
            setStudyRevealed(false);
          }
          if (msg.state.status === "playing" && screen === "input") {
            setScreen("floor");
          }
          break;
        case "notify":
          showNotif(msg.msg);
          break;
        case "duel_start":
          showNotif(`${msg.challenger} vs ${msg.defender} — ${CATS[msg.category]?.icon} ${msg.category}!`);
          break;
        case "duel_end":
          showNotif(msg.msg);
          if (duelLocal) {
            if (duelLocal.isSpectator) {
              setDuelLocal(prev => prev ? { ...prev, resultMsg: msg.msg, ended: true, winnerId: msg.winnerId } : null);
            } else {
              const won = msg.winnerId === socket.id;
              setDuelLocal(prev => prev ? { ...prev, resultWon: won, resultMsg: msg.msg, ended: true } : null);
            }
          }
          break;
        case "game_over":
          showNotif(`${msg.winnerName} WINS THE FLOOR!`);
          bgm.stop();
          setBgmOn(false);
          break;
        case "error":
          showNotif(msg.msg);
          break;
      }
    },
  });

  // ── Join handler ────────────────────────────────────────────────
  const handleJoin = () => {
    if (!myName.trim() || !roomCode.trim()) return;
    socket.send(JSON.stringify({
      type: "join",
      name: myName.trim(),
      isTeacher,
    }));
    setScreen("floor");
  };

  // ── Start game (teacher) ─────────────────────────────────────────
  const handleStart = () => {
    socket.send(JSON.stringify({ type: "start_game" }));
    // Auto-start BGM
    if (!bgmOn) {
      bgm.start();
      setBgmOn(true);
    }
  };

  // ── Challenge a tile ─────────────────────────────────────────────
  const handleChallenge = (tile) => {
    if (!gameState || gameState.duel || isTeacher) return;
    const categoryQuestions = QDB[tile.category];
    // Create shuffled indices and send to server for sync
    const indices = shuffle(categoryQuestions.map((_, i) => i));
    socket.send(JSON.stringify({
      type: "challenge",
      tileId: tile.id,
      questionIndices: indices,
    }));
    const defender = gameState.players[tile.owner];
    setDuelLocal({
      tileId: tile.id,
      category: tile.category,
      opponent: defender,
      questionIndices: indices,
      myTime: 450,
      opTime: 450,
      input: "",
      feedback: null,
      ended: false,
      resultWon: null,
      amChallenger: true,
      isSpectator: false,
    });
    resultReported.current = false;
    setSpokenText("");
    setScreen("duel");
  };

  // ── When I'm challenged OR teacher spectates ────────────────────
  useEffect(() => {
    if (!gameState?.duel || screen === "duel" || screen === "join") return;
    const duel = gameState.duel;
    const imInvolved = duel.challengerId === socket.id || duel.defenderId === socket.id;

    if (imInvolved) {
      const opponentId = duel.challengerId === socket.id ? duel.defenderId : duel.challengerId;
      setDuelLocal({
        tileId: duel.tileId,
        category: duel.category,
        opponent: gameState.players[opponentId],
        questionIndices: duel.questionIndices,
        myTime: 450,
        opTime: 450,
        input: "",
        feedback: null,
        ended: false,
        resultWon: null,
        amChallenger: duel.challengerId === socket.id,
        isSpectator: false,
      });
      resultReported.current = false;
      setSpokenText("");
      setScreen("duel");
    } else if (isTeacher) {
      // Teacher spectator mode — watch the duel live
      setDuelLocal({
        tileId: duel.tileId,
        category: duel.category,
        opponent: null,
        questionIndices: duel.questionIndices,
        myTime: 450,  // challenger's time
        opTime: 450,  // defender's time
        input: "",
        feedback: null,
        ended: false,
        resultWon: null,
        amChallenger: false,
        isSpectator: true,
      });
      resultReported.current = false;
      setScreen("duel");
    }
  }, [gameState?.duel]);

  // ── Get current question (synced from server) ────────────────────
  const getCurrentQuestion = () => {
    if (!duelLocal || !gameState?.duel) return null;
    const { category } = duelLocal;
    const indices = duelLocal.questionIndices;
    const qIdx = gameState.duel.currentQIdx;
    const actualIdx = indices[qIdx % indices.length];
    return QDB[category][actualIdx];
  };

  // ── Duel timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "duel" || !duelLocal || duelLocal.ended) return;
    if (!gameState?.duel) return;

    // Spectator timer: myTime = challenger, opTime = defender
    if (duelLocal.isSpectator) {
      const activeIsChallenger = gameState.duel.active === gameState.duel.challengerId;
      timerRef.current = setInterval(() => {
        setDuelLocal(prev => {
          if (!prev || prev.ended) return prev;
          if (activeIsChallenger) {
            return { ...prev, myTime: Math.max(0, prev.myTime - 1) };
          } else {
            return { ...prev, opTime: Math.max(0, prev.opTime - 1) };
          }
        });
      }, 100);
      return () => clearInterval(timerRef.current);
    }

    const isMyTurn = gameState.duel.active === socket.id;

    timerRef.current = setInterval(() => {
      setDuelLocal(prev => {
        if (!prev || prev.ended) return prev;
        if (isMyTurn) {
          const next = prev.myTime - 1;
          if (next <= 0 && !resultReported.current) {
            resultReported.current = true;
            setTimeout(() => {
              socket.send(JSON.stringify({
                type: "duel_result",
                winnerId: gameState.duel.defenderId === socket.id
                  ? gameState.duel.challengerId
                  : gameState.duel.defenderId,
                loserId: socket.id,
                tileId: gameState.duel.tileId,
              }));
            }, 0);
          }
          return { ...prev, myTime: Math.max(0, next) };
        } else {
          return { ...prev, opTime: Math.max(0, prev.opTime - 1) };
        }
      });
    }, 100);

    return () => clearInterval(timerRef.current);
  }, [screen, gameState?.duel?.active, duelLocal?.ended]);

  // ── Speech recognition handler ───────────────────────────────────
  const startListening = () => {
    if (!speechSupported || listening) return;
    const q = getCurrentQuestion();
    if (!q) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;

    recognition.onstart = () => {
      setListening(true);
      setSpokenText("");
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onresult = (event) => {
      const results = event.results[0];
      const firstTranscript = results[0].transcript;
      setSpokenText(firstTranscript);

      // Check all alternatives for a match
      let matched = false;
      for (let i = 0; i < results.length; i++) {
        if (checkSpeechMatch(results[i].transcript, q.answer)) {
          matched = true;
          break;
        }
      }

      if (matched) {
        setDuelLocal(prev => prev ? { ...prev, feedback: "correct", input: "" } : null);
        setTimeout(() => {
          socket.send(JSON.stringify({ type: "switch_turn" }));
          setDuelLocal(prev => prev ? { ...prev, feedback: null } : null);
          setSpokenText("");
        }, 800);
      } else {
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setDuelLocal(prev => prev ? { ...prev, feedback: "wrong" } : null);
        setTimeout(() => setDuelLocal(prev => prev ? { ...prev, feedback: null } : null), 1000);
      }
    };

    recognition.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  };

  // ── Text input answer (fallback) ─────────────────────────────────
  const handleAnswer = () => {
    if (!duelLocal || duelLocal.ended) return;
    if (gameState?.duel?.active !== socket.id) return;
    const q = getCurrentQuestion();
    if (!q) return;

    const correct = checkSpeechMatch(duelLocal.input, q.answer);

    if (correct) {
      setDuelLocal(prev => ({ ...prev, feedback: "correct", input: "" }));
      setTimeout(() => {
        socket.send(JSON.stringify({ type: "switch_turn" }));
        setDuelLocal(prev => prev && ({ ...prev, feedback: null }));
        setTimeout(() => inputRef.current?.focus(), 50);
      }, 600);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      setDuelLocal(prev => ({ ...prev, input: "", feedback: "wrong" }));
      setTimeout(() => setDuelLocal(prev => prev && ({ ...prev, feedback: null })), 700);
    }
  };

  const handlePass = () => {
    if (!duelLocal || duelLocal.ended || gameState?.duel?.active !== socket.id) return;
    setDuelLocal(prev => ({
      ...prev,
      myTime: Math.max(0, prev.myTime - 30),
      input: "",
    }));
    // Also advance to next question via server
    socket.send(JSON.stringify({ type: "switch_turn" }));
  };

  const handleDuelBack = () => {
    setDuelLocal(null);
    resultReported.current = false;
    setSpokenText("");
    stopListening();
    setScreen("floor");
  };

  // ── Derived state ─────────────────────────────────────────────────
  const me = gameState?.players?.[socket.id];
  const myTiles = gameState?.grid?.filter(t => t.owner === socket.id) || [];
  const attackableIds = new Set(
    (gameState?.grid || [])
      .filter(t => t.owner && t.owner !== socket.id &&
        myTiles.some(mt => adjacent(mt, t)))
      .map(t => t.id)
  );

  // ══ SCREENS ══════════════════════════════════════════════════════

  // ── JOIN ─────────────────────────────────────────────────────────
  if (screen === "join") return (
    <div style={styles.page}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={styles.title}>WISE ENGLISH FLOOR</div>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.8rem", letterSpacing: "0.08em" }}>
          MULTIPLAYER VOCABULARY BATTLE
        </p>
      </div>
      <div style={styles.card}>
        <label style={styles.label}>ROOM CODE</label>
        <input
          style={styles.input}
          placeholder="e.g.  monday-class"
          value={roomCode}
          onChange={e => setRoomCode(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
        />
        <label style={styles.label}>YOUR NAME</label>
        <input
          style={styles.input}
          placeholder="Enter your name"
          value={myName}
          onChange={e => setMyName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleJoin()}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
          <input type="checkbox" id="teacher" checked={isTeacher}
            onChange={e => setIsTeacher(e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }} />
          <label htmlFor="teacher" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem", cursor: "pointer" }}>
            I'm the teacher (can start the game)
          </label>
        </div>
        <button style={styles.btn} onClick={handleJoin}
          disabled={!myName.trim() || !roomCode.trim()}>
          JOIN ROOM
        </button>
      </div>
      <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.7rem", marginTop: 20 }}>
        Share the room code with students. Everyone opens this URL and enters the same code.
      </p>
    </div>
  );

  // ── FLOOR ─────────────────────────────────────────────────────────
  if (screen === "floor") {
    const players = Object.values(gameState?.players || {});
    const grid = gameState?.grid || [];
    const status = gameState?.status || "waiting";
    const duel = gameState?.duel;

    return (
      <div style={styles.page}>
        {notification && (
          <div style={styles.notif}>{notification}</div>
        )}

        {/* BGM toggle */}
        <button onClick={toggleBgm} style={styles.bgmBtn}>
          {bgmOn ? "♪ ON" : "♪ OFF"}
        </button>

        {/* Leave button */}
        <button onClick={() => { bgm.stop(); setBgmOn(false); setScreen("join"); setGameState(null); setDuelLocal(null); }}
          style={{ ...styles.passBtn, position: "fixed", top: 12, left: 12, padding: "6px 12px", fontSize: "0.65rem", zIndex: 999 }}>
          LEAVE
        </button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ ...styles.title, fontSize: "clamp(1.4rem,5vw,1.8rem)" }}>
            WISE ENGLISH FLOOR
          </div>
          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", marginTop: 2 }}>
            ROOM: <span style={{ color: "#00d4ff" }}>{roomCode.toUpperCase()}</span>
            {me && <span style={{ marginLeft: 10, color: me.color }}>● {me.name}</span>}
          </div>
        </div>

        {/* Waiting state */}
        {status === "waiting" && (
          <div style={styles.card}>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 14, fontSize: "0.85rem" }}>
              {players.length} player{players.length !== 1 ? "s" : ""} connected
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16, justifyContent: "center" }}>
              {players.map(p => (
                <span key={p.id} style={{
                  padding: "5px 12px", borderRadius: 20,
                  background: `${p.color}18`, border: `1.5px solid ${p.color}55`,
                  color: p.color, fontSize: "0.78rem", fontWeight: 600,
                }}>
                  {p.name}{p.isTeacher ? " (T)" : ""}
                </span>
              ))}
            </div>
            {isTeacher ? (
              <button style={{ ...styles.btn, opacity: players.length < 2 ? 0.4 : 1 }}
                onClick={() => socket.send(JSON.stringify({ type: "start_input" }))}
                disabled={players.length < 2}>
                START LEARNING ({players.length} players)
              </button>
            ) : (
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.8rem" }}>
                Waiting for the teacher to start...
              </p>
            )}
          </div>
        )}

        {/* Teacher: Reset button when game is playing */}
        {status === "playing" && isTeacher && !duel && (
          <button
            onClick={() => socket.send(JSON.stringify({ type: "reset" }))}
            style={{
              ...styles.passBtn,
              marginBottom: 12, padding: "8px 18px",
              fontSize: "0.7rem", color: "#ff4757",
              border: "1px solid rgba(255,71,87,0.3)",
            }}
          >
            RESET GAME
          </button>
        )}

        {/* Active duel banner */}
        {status === "playing" && duel && (
          <div style={{
            background: "rgba(255,165,0,0.1)", border: "1px solid rgba(255,165,0,0.35)",
            borderRadius: 10, padding: "8px 16px", marginBottom: 12,
            fontSize: "0.78rem", color: "#ffa502", textAlign: "center",
          }}>
            Duel: {gameState.players[duel.challengerId]?.name} vs {gameState.players[duel.defenderId]?.name}
          </div>
        )}

        {/* Grid */}
        {status === "playing" && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 5,
            width: "min(420px, 95vw)",
            margin: "0 auto 18px",
          }}>
            {grid.map(tile => {
              const owner = tile.owner ? gameState.players[tile.owner] : null;
              const isMe = tile.owner === socket.id;
              const isAttack = attackableIds.has(tile.id) && !duel;
              const catInfo = CATS[tile.category];
              return (
                <div key={tile.id}
                  onClick={() => isAttack && handleChallenge(tile)}
                  style={{
                    aspectRatio: "1",
                    borderRadius: 8,
                    background: owner ? `${owner.color}12` : "#0d0d28",
                    border: `2px solid ${owner ? owner.color + (isMe ? "cc" : "50") : "rgba(255,255,255,0.07)"}`,
                    boxShadow: isMe ? `0 0 16px ${owner?.color}44` : isAttack ? `0 0 10px ${owner?.color}66` : "none",
                    cursor: isAttack ? "pointer" : "default",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    padding: 4, position: "relative",
                    transform: isAttack ? "scale(1.04)" : "scale(1)",
                    transition: "transform 0.15s, box-shadow 0.15s",
                  }}>
                  <span style={{ fontSize: "clamp(1rem,4vw,1.4rem)", lineHeight: 1 }}>{catInfo.icon}</span>
                  <span style={{ fontSize: "clamp(0.38rem,1.2vw,0.48rem)", fontWeight: 700, color: catInfo.color, textTransform: "uppercase" }}>
                    {catInfo.label}
                  </span>
                  {owner && (
                    <span style={{
                      position: "absolute", bottom: 2, right: 3,
                      fontSize: "0.48rem", fontWeight: 700, color: owner.color,
                    }}>{owner.name.slice(0, 3).toUpperCase()}</span>
                  )}
                  {isAttack && (
                    <span style={{ position: "absolute", top: 2, right: 2, fontSize: "0.5rem" }}>*</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Scoreboard */}
        {status === "playing" && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            {Object.values(gameState.players).map(p => (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px",
                background: `${p.color}10`, border: `1.5px solid ${p.color}40`,
                borderRadius: 20,
              }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.color }} />
                <span style={{ color: p.color, fontSize: "0.7rem", fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.7rem" }}>
                  {grid.filter(t => t.owner === p.id).length}
                </span>
              </div>
            ))}
          </div>
        )}

        {status === "playing" && isTeacher && !duel && (
          <p style={{ color: "rgba(255,165,0,0.5)", fontSize: "0.75rem", marginTop: 14, textAlign: "center" }}>
            SPECTATOR MODE — duels will appear here automatically
          </p>
        )}
        {status === "playing" && !isTeacher && !duel && attackableIds.size === 0 && myTiles.length > 0 && (
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.75rem", marginTop: 14, textAlign: "center" }}>
            No adjacent enemies — wait for others to move closer
          </p>
        )}
        {status === "playing" && !isTeacher && myTiles.length === 0 && (
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.75rem", marginTop: 14, textAlign: "center" }}>
            You have no tiles yet
          </p>
        )}
      </div>
    );
  }

  // ── INPUT (Learning Phase) ─────────────────────────────────────────
  if (screen === "input") {
    const players = Object.values(gameState?.players || {});
    const students = players.filter(p => !p.isTeacher);
    const progress = gameState?.inputProgress || {};
    const catKeys = Object.keys(CATS);

    // ── Teacher dashboard ──
    if (isTeacher) {
      const totalStudied = students.reduce((sum, s) => sum + (progress[s.id]?.length || 0), 0);
      const totalPossible = students.length * catKeys.length;
      return (
        <div style={styles.page}>
          {notification && <div style={styles.notif}>{notification}</div>}
          <button onClick={toggleBgm} style={styles.bgmBtn}>{bgmOn ? "♪ ON" : "♪ OFF"}</button>

          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ ...styles.title, fontSize: "clamp(1.4rem,5vw,1.8rem)" }}>LEARNING TIME</div>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", marginTop: 4 }}>
              Students are studying vocabulary
            </p>
          </div>

          {/* Progress overview */}
          <div style={{ ...styles.card, marginBottom: 16, alignItems: "center" }}>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: "#00d4ff", marginBottom: 4 }}>
              {totalStudied} / {totalPossible}
            </div>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem" }}>categories studied</p>
          </div>

          {/* Per-student progress */}
          <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {students.map(s => {
              const done = progress[s.id] || [];
              return (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 12,
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${s.color}30`,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
                  <span style={{ color: s.color, fontWeight: 600, fontSize: "0.8rem", minWidth: 60 }}>{s.name}</span>
                  <div style={{ display: "flex", gap: 4, flex: 1 }}>
                    {catKeys.map(key => {
                      const studied = done.includes(key);
                      const cat = CATS[key];
                      return (
                        <div key={key} style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: studied ? `${cat.color}30` : "rgba(255,255,255,0.04)",
                          border: `1px solid ${studied ? cat.color + "60" : "rgba(255,255,255,0.08)"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.7rem",
                        }}>
                          {studied ? cat.icon : ""}
                        </div>
                      );
                    })}
                  </div>
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem" }}>{done.length}/{catKeys.length}</span>
                </div>
              );
            })}
          </div>

          {/* Start Battle button */}
          <button style={styles.btn} onClick={handleStart}>
            START BATTLE
          </button>
          <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.65rem", marginTop: 8 }}>
            Press when students are ready to duel
          </p>
        </div>
      );
    }

    // ── Student: category selector ──
    if (!studyCategory) {
      return (
        <div style={styles.page}>
          {notification && <div style={styles.notif}>{notification}</div>}

          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ ...styles.title, fontSize: "clamp(1.4rem,5vw,1.8rem)" }}>STUDY TIME</div>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", marginTop: 4 }}>
              Choose a category to learn
            </p>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
            gap: 10, width: "100%", maxWidth: 340,
          }}>
            {catKeys.map(key => {
              const cat = CATS[key];
              const done = studiedCategories.includes(key);
              return (
                <button key={key}
                  onClick={() => { setStudyCategory(key); setStudyIndex(0); setStudyRevealed(false); }}
                  style={{
                    padding: "18px 10px", borderRadius: 14,
                    background: done ? `${cat.color}18` : "rgba(255,255,255,0.04)",
                    border: `2px solid ${done ? cat.color + "70" : cat.color + "30"}`,
                    cursor: "pointer", display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 6, position: "relative",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ fontSize: "1.8rem" }}>{cat.icon}</span>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: cat.color, textTransform: "uppercase" }}>
                    {cat.label}
                  </span>
                  {done && (
                    <span style={{
                      position: "absolute", top: 6, right: 6,
                      fontSize: "0.8rem", color: "#2ed573",
                    }}>done</span>
                  )}
                </button>
              );
            })}
          </div>

          <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.7rem", marginTop: 20 }}>
            {studiedCategories.length}/{catKeys.length} categories studied
          </p>
        </div>
      );
    }

    // ── Student: flashcard drill ──
    const catQuestions = QDB[studyCategory];
    const currentCard = catQuestions[studyIndex];
    const catInfo = CATS[studyCategory];
    const isLastCard = studyIndex >= catQuestions.length - 1;

    return (
      <div style={styles.page}>
        {notification && <div style={styles.notif}>{notification}</div>}

        {/* Back button */}
        <button
          onClick={() => setStudyCategory(null)}
          style={{ ...styles.passBtn, alignSelf: "flex-start", marginBottom: 12, fontSize: "0.7rem" }}
        >
          Back
        </button>

        {/* Category + progress */}
        <div style={{
          padding: "5px 16px", marginBottom: 8,
          background: `${catInfo.color}18`, border: `1.5px solid ${catInfo.color}50`,
          borderRadius: 24, fontSize: "0.72rem", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.12em", color: catInfo.color,
        }}>
          {catInfo.icon} {catInfo.label}
        </div>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem", marginBottom: 20 }}>
          {studyIndex + 1} / {catQuestions.length}
        </p>

        {/* Flashcard */}
        <div
          onClick={() => setStudyRevealed(true)}
          style={{
            width: "min(300px, 85vw)", minHeight: 220, borderRadius: 20,
            background: "rgba(255,255,255,0.04)", border: `2px solid ${catInfo.color}40`,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            cursor: studyRevealed ? "default" : "pointer",
            padding: 20, marginBottom: 16,
            transition: "border-color 0.2s",
          }}
        >
          <img src={currentCard.img} alt="" style={{
            width: "clamp(140px, 45vw, 200px)", height: "clamp(140px, 45vw, 200px)",
            objectFit: "cover", borderRadius: 16, marginBottom: 16,
          }} />
          {studyRevealed ? (
            <div style={{
              fontSize: "1.5rem", fontWeight: 700, color: catInfo.color,
              letterSpacing: "0.05em", animation: "pulse 0.4s ease",
            }}>
              {currentCard.answer}
            </div>
          ) : (
            <div style={{
              padding: "8px 20px", borderRadius: 10,
              background: `${catInfo.color}15`, border: `1px solid ${catInfo.color}40`,
              color: catInfo.color, fontSize: "0.75rem", fontWeight: 600,
            }}>
              TAP TO REVEAL
            </div>
          )}
        </div>

        {/* Mic practice (optional, only after reveal) */}
        {studyRevealed && speechSupported && (
          <button
            onClick={() => {
              if (listening) { stopListening(); return; }
              const recognition = new SpeechRecognition();
              recognition.lang = "en-US";
              recognition.continuous = false;
              recognition.interimResults = false;
              recognition.maxAlternatives = 5;
              recognition.onstart = () => { setListening(true); setSpokenText(""); };
              recognition.onend = () => { setListening(false); recognitionRef.current = null; };
              recognition.onresult = (event) => {
                const results = event.results[0];
                setSpokenText(results[0].transcript);
                let matched = false;
                for (let i = 0; i < results.length; i++) {
                  if (checkSpeechMatch(results[i].transcript, currentCard.answer)) { matched = true; break; }
                }
                setShake(!matched);
                if (!matched) setTimeout(() => setShake(false), 400);
              };
              recognition.onerror = () => { setListening(false); recognitionRef.current = null; };
              recognitionRef.current = recognition;
              recognition.start();
            }}
            style={{
              width: 56, height: 56, borderRadius: "50%", marginBottom: 8,
              background: listening
                ? "radial-gradient(circle, #ff4757, #ff6b81)"
                : `radial-gradient(circle, ${catInfo.color}, ${catInfo.color}cc)`,
              border: `2px solid ${listening ? "#ff4757" : catInfo.color}`,
              boxShadow: listening ? "0 0 20px rgba(255,71,87,0.4)" : "none",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.4rem", animation: listening ? "pulse 1s ease-in-out infinite" : "none",
            }}
          >
            {listening ? "..." : "🎤"}
          </button>
        )}
        {spokenText && (
          <p style={{ color: checkSpeechMatch(spokenText, currentCard.answer) ? "#2ed573" : "#ff4757", fontSize: "0.8rem", marginBottom: 8 }}>
            "{spokenText}" {checkSpeechMatch(spokenText, currentCard.answer) ? "- Correct!" : "- Try again"}
          </p>
        )}

        {/* Next / Done button */}
        {studyRevealed && (
          <button
            onClick={() => {
              if (isLastCard) {
                // Category complete
                if (!studiedCategories.includes(studyCategory)) {
                  setStudiedCategories(prev => [...prev, studyCategory]);
                }
                socket.send(JSON.stringify({ type: "study_complete", category: studyCategory }));
                setStudyCategory(null);
                setSpokenText("");
              } else {
                setStudyIndex(prev => prev + 1);
                setStudyRevealed(false);
                setSpokenText("");
              }
            }}
            style={{
              ...styles.btn, maxWidth: 200, marginTop: 8,
              background: isLastCard
                ? "linear-gradient(135deg, #2ed573, #10b981)"
                : "linear-gradient(135deg, #00d4ff, #0096ff)",
            }}
          >
            {isLastCard ? "DONE" : "NEXT"}
          </button>
        )}

        <style>{`
          @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        `}</style>
      </div>
    );
  }

  // ── DUEL ──────────────────────────────────────────────────────────
  if (screen === "duel" && duelLocal) {
    const isMyTurn = gameState?.duel?.active === socket.id;
    const { myTime, opTime, feedback, ended, resultWon, opponent } = duelLocal;
    const q = getCurrentQuestion();
    const catInfo = CATS[duelLocal.category];

    // ── SPECTATOR VIEW (Teacher) — THE FLOOR TV Style ───────────────
    if (duelLocal.isSpectator) {
      const challenger = gameState?.players?.[gameState?.duel?.challengerId];
      const defender = gameState?.players?.[gameState?.duel?.defenderId];
      const activeIsChallenger = gameState?.duel?.active === gameState?.duel?.challengerId;
      const winnerPlayer = duelLocal.winnerId ? gameState?.players?.[duelLocal.winnerId] : null;

      if (ended) {
        return (
          <div style={styles.tvPage}>
            <button onClick={toggleBgm} style={styles.bgmBtn}>{bgmOn ? "♪ ON" : "♪ OFF"}</button>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "5rem", marginBottom: 10 }}>⚔️</div>
                <div style={{ ...styles.title, fontSize: "2.5rem" }}>DUEL FINISHED</div>
                {winnerPlayer && (
                  <div style={{ fontSize: "2rem", color: winnerPlayer.color, fontWeight: 700, margin: "16px 0" }}>
                    {winnerPlayer.name} WINS!
                  </div>
                )}
              </div>
            </div>
            <button style={{ ...styles.btn, position: "absolute", bottom: 30, maxWidth: 200 }} onClick={handleDuelBack}>
              BACK TO FLOOR
            </button>
          </div>
        );
      }

      // Teacher sends switch_turn on behalf of the active player
      const handleTeacherSwitch = () => {
        if (!gameState?.duel) return;
        socket.send(JSON.stringify({
          type: "teacher_switch",
          activeId: gameState.duel.active,
        }));
      };

      return (
        <div style={styles.tvPage}>
          <button onClick={toggleBgm} style={styles.bgmBtn}>{bgmOn ? "♪ ON" : "♪ OFF"}</button>

          {/* Question area — tap to switch turn */}
          <div
            onClick={handleTeacherSwitch}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              width: "100%", position: "relative", cursor: "pointer",
              userSelect: "none", WebkitTapHighlightColor: "transparent",
            }}
          >
            {/* Question bg card */}
            <div style={{
              width: "min(80vw, 500px)", height: "min(55vh, 400px)",
              background: "linear-gradient(180deg, #fffbe6 0%, #fff3c4 100%)",
              borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 8px 40px rgba(0,0,0,0.4), inset 0 0 80px rgba(255,255,255,0.3)",
              border: "3px solid rgba(255,255,255,0.2)",
              position: "relative",
            }}>
              {q && (
                <img src={q.img} alt="" style={{
                  maxWidth: "85%", maxHeight: "85%", objectFit: "contain", borderRadius: 16,
                }} />
              )}
              {/* Tap hint */}
              <div style={{
                position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
                padding: "4px 14px", borderRadius: 12,
                background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
                fontSize: "0.7rem", color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap",
              }}>
                Tap = correct, switch turn
              </div>
            </div>
          </div>

          {/* Bottom bar — THE FLOOR style */}
          <div style={{
            width: "100%", display: "flex", alignItems: "stretch",
            height: 90, position: "relative",
          }}>
            {/* Left player */}
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 20px",
              background: activeIsChallenger
                ? `linear-gradient(90deg, ${challenger?.color}50, ${challenger?.color}20)`
                : "rgba(255,255,255,0.04)",
              borderTop: `3px solid ${challenger?.color || "#00d4ff"}`,
              transition: "background 0.3s",
            }}>
              <div>
                <div style={{
                  fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em",
                  color: activeIsChallenger ? challenger?.color : "rgba(255,255,255,0.3)",
                  animation: activeIsChallenger ? "blink 1.1s ease-in-out infinite" : "none",
                }}>
                  {activeIsChallenger ? "ANSWERING" : "WAITING"}
                </div>
                <div style={{ fontSize: "clamp(0.9rem, 2.5vw, 1.2rem)", fontWeight: 700, color: challenger?.color }}>
                  {challenger?.name}
                </div>
              </div>
              <div style={{
                fontFamily: "monospace", fontSize: "clamp(1.8rem, 5vw, 2.8rem)", fontWeight: 700,
                color: myTime < 100 ? "#ff4757" : challenger?.color,
              }}>
                {fmtTime(myTime)}
              </div>
            </div>

            {/* Center category badge */}
            <div style={{
              position: "absolute", left: "50%", top: -18, transform: "translateX(-50%)",
              padding: "6px 20px", borderRadius: 20,
              background: "#0e0e30", border: `2px solid ${catInfo.color}60`,
              fontSize: "0.7rem", fontWeight: 700, color: catInfo.color,
              textTransform: "uppercase", letterSpacing: "0.1em", zIndex: 2,
              boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
            }}>
              {catInfo.icon} {catInfo.label}
            </div>

            {/* VS divider */}
            <div style={{ width: 2, background: "rgba(255,255,255,0.15)" }} />

            {/* Right player */}
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 20px",
              background: !activeIsChallenger
                ? `linear-gradient(270deg, ${defender?.color}50, ${defender?.color}20)`
                : "rgba(255,255,255,0.04)",
              borderTop: `3px solid ${defender?.color || "#ff4757"}`,
              transition: "background 0.3s",
            }}>
              <div style={{
                fontFamily: "monospace", fontSize: "clamp(1.8rem, 5vw, 2.8rem)", fontWeight: 700,
                color: opTime < 100 ? "#ff4757" : defender?.color,
              }}>
                {fmtTime(opTime)}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{
                  fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em",
                  color: !activeIsChallenger ? defender?.color : "rgba(255,255,255,0.3)",
                  animation: !activeIsChallenger ? "blink 1.1s ease-in-out infinite" : "none",
                }}>
                  {!activeIsChallenger ? "ANSWERING" : "WAITING"}
                </div>
                <div style={{ fontSize: "clamp(0.9rem, 2.5vw, 1.2rem)", fontWeight: 700, color: defender?.color }}>
                  {defender?.name}
                </div>
              </div>
            </div>
          </div>

          <style>{`
            @keyframes blink { 0%,100%{opacity:0.2} 50%{opacity:1} }
          `}</style>
        </div>
      );
    }

    // Student duel view — just show "look at the screen" + status
    if (ended) {
      return (
        <div style={{ ...styles.page, justifyContent: "center", minHeight: "100vh" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "5rem", marginBottom: 10 }}>{resultWon ? "🏆" : "💀"}</div>
            <div style={{ ...styles.title, color: resultWon ? "#2ed573" : "#ff4757", fontSize: "2.5rem" }}>
              {resultWon ? "YOU WIN!" : "YOU LOSE"}
            </div>
            <p style={{ color: "rgba(255,255,255,0.4)", margin: "8px 0", fontSize: "0.85rem" }}>
              {catInfo.icon} {catInfo.label} tile {resultWon ? "claimed!" : "defended by " + opponent?.name}
            </p>
            <button style={{ ...styles.btn, marginTop: 28 }} onClick={handleDuelBack}>
              BACK TO FLOOR
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ ...styles.page, justifyContent: "center", minHeight: "100vh" }}>
        <button onClick={() => { setScreen("floor"); setDuelLocal(null); }}
          style={{ ...styles.passBtn, position: "fixed", top: 12, left: 12, padding: "6px 12px", fontSize: "0.65rem", zIndex: 999 }}>
          LEAVE
        </button>
        {/* Category */}
        <div style={{
          padding: "5px 16px", marginBottom: 20,
          background: `${catInfo.color}18`, border: `1.5px solid ${catInfo.color}50`,
          borderRadius: 24, fontSize: "0.72rem", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.12em", color: catInfo.color,
        }}>
          {catInfo.icon} {catInfo.label}
        </div>

        {/* Big status */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{
            fontSize: "clamp(3rem, 12vw, 5rem)", marginBottom: 8,
          }}>
            {isMyTurn ? "🗣️" : "👀"}
          </div>
          <div style={{
            fontSize: "clamp(1.2rem, 4vw, 1.6rem)", fontWeight: 700,
            color: isMyTurn ? "#00d4ff" : "rgba(255,255,255,0.4)",
          }}>
            {isMyTurn ? "YOUR TURN!" : `${opponent?.name}'s turn`}
          </div>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.8rem", marginTop: 8 }}>
            Look at the screen and say the answer!
          </p>
        </div>

        {/* Timer */}
        <div style={{
          fontFamily: "monospace", fontSize: "clamp(2rem, 8vw, 3.5rem)", fontWeight: 700,
          color: myTime < 100 ? "#ff4757" : isMyTurn ? "#00d4ff" : "rgba(255,255,255,0.3)",
        }}>
          {fmtTime(myTime)}
        </div>
        <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.65rem", marginTop: 4 }}>your time</p>

        <style>{`
          @keyframes blink { 0%,100%{opacity:0.2} 50%{opacity:1} }
        `}</style>
      </div>
    );
  }

  return null;
}

// ── Styles ─────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse at 50% 20%, #0e0e30 0%, #06060f 70%)",
    color: "white",
    fontFamily: "'Inter', -apple-system, sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "28px 16px",
  },
  tvPage: {
    minHeight: "100vh",
    height: "100vh",
    background: "radial-gradient(ellipse at 50% 30%, #0a1628 0%, #06060f 70%)",
    color: "white",
    fontFamily: "'Inter', -apple-system, sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 0,
    overflow: "hidden",
    position: "relative",
  },
  title: {
    fontFamily: "'Bebas Neue', 'Impact', sans-serif",
    fontSize: "clamp(1.8rem,6vw,2.4rem)",
    letterSpacing: "0.12em",
    background: "linear-gradient(135deg, #00d4ff 30%, #a855f7)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 16,
    padding: "24px 28px",
    width: "100%",
    maxWidth: 380,
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
  },
  label: {
    fontSize: "0.65rem",
    fontWeight: 700,
    letterSpacing: "0.12em",
    color: "rgba(255,255,255,0.35)",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    background: "rgba(255,255,255,0.06)",
    border: "1.5px solid rgba(255,255,255,0.15)",
    borderRadius: 10,
    color: "white",
    fontSize: "1rem",
    marginBottom: 18,
    fontFamily: "inherit",
    outline: "none",
  },
  btn: {
    flex: 1,
    padding: "13px 16px",
    background: "linear-gradient(135deg, #00d4ff, #0096ff)",
    color: "#000",
    border: "none",
    borderRadius: 12,
    fontSize: "0.85rem",
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.08em",
    fontFamily: "inherit",
  },
  passBtn: {
    padding: "13px 12px",
    background: "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.4)",
    border: "1.5px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    fontSize: "0.72rem",
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  ansInput: {
    width: "100%",
    maxWidth: 300,
    padding: "14px 20px",
    borderRadius: 14,
    fontSize: "1.1rem",
    textAlign: "center",
    outline: "none",
    color: "white",
    fontFamily: "'DM Mono', monospace",
  },
  notif: {
    position: "fixed",
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.85)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 10,
    padding: "10px 20px",
    fontSize: "0.82rem",
    color: "white",
    zIndex: 1000,
    maxWidth: "90vw",
    textAlign: "center",
    boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
  },
  bgmBtn: {
    position: "fixed",
    top: 12,
    right: 12,
    padding: "6px 12px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 8,
    color: "rgba(255,255,255,0.5)",
    fontSize: "0.7rem",
    cursor: "pointer",
    zIndex: 999,
    fontFamily: "inherit",
  },
};
