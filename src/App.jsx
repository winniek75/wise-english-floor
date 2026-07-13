import { useState, useEffect, useRef, useCallback } from "react";
import usePartySocket from "partysocket/react";

// ── QUESTION DATA ──────────────────────────────────────────────────
const makeQ = (cat, [name, meaning]) => ({ img: `/images/${cat}/${name}.webp`, answer: name, meaning });
const QDB = {
  animals: [["elephant","ゾウ"],["giraffe","キリン"],["penguin","ペンギン"],["lion","ライオン"],["dolphin","イルカ"],["fox","キツネ"],["bear","クマ"],["eagle","ワシ"],["crocodile","ワニ"],["zebra","シマウマ"]].map(e => makeQ("animals", e)),
  food: [["pizza","ピザ"],["sushi","寿司"],["taco","タコス"],["avocado","アボカド"],["noodles","麺"],["steak","ステーキ"],["donut","ドーナツ"],["croissant","クロワッサン"],["waffle","ワッフル"],["blueberry","ブルーベリー"]].map(e => makeQ("food", e)),
  sports: [["baseball","野球"],["basketball","バスケ"],["tennis","テニス"],["soccer","サッカー"],["swimming","水泳"],["boxing","ボクシング"],["surfing","サーフィン"],["gymnastics","体操"],["weightlifting","重量挙げ"],["skiing","スキー"]].map(e => makeQ("sports", e)),
  jobs: [["doctor","医者"],["chef","シェフ"],["firefighter","消防士"],["teacher","先生"],["pilot","パイロット"],["scientist","科学者"],["programmer","プログラマー"],["police","警察官"],["artist","アーティスト"],["judge","裁判官"]].map(e => makeQ("jobs", e)),
  transport: [["airplane","飛行機"],["train","電車"],["ship","船"],["helicopter","ヘリコプター"],["scooter","スクーター"],["bicycle","自転車"],["rocket","ロケット"],["taxi","タクシー"],["ufo","UFO"],["boat","ボート"]].map(e => makeQ("transport", e)),
  school: [["pencil","鉛筆"],["microscope","顕微鏡"],["backpack","リュック"],["books","本"],["pen","ペン"],["notebook","ノート"],["ruler","定規"],["folder","フォルダ"],["computer","パソコン"],["telescope","望遠鏡"]].map(e => makeQ("school", e)),
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

// ── TTS (Google voice preferred) ───────────────────────────────────
let ttsVoice = null;
if (typeof window !== "undefined" && window.speechSynthesis) {
  const loadVoices = () => {
    const voices = speechSynthesis.getVoices();
    ttsVoice = voices.find(v => v.name.includes("Google") && v.lang.startsWith("en"))
      || voices.find(v => v.lang.startsWith("en-"));
  };
  speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}
const speakWord = (word) => {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "en-US";
  u.rate = 0.85;
  if (ttsVoice) u.voice = ttsVoice;
  speechSynthesis.speak(u);
};

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

// ── SFX (correct / wrong) ──────────────────────────────────────────
const playSFX = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (type === "correct") {
      // C-E-G major chord chime: sine wave, 0.2 gain, 0.3s duration, 0.1s spacing
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    } else {
      // Wrong: square wave sweeping 150 -> 100 Hz over 0.2s
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
    setTimeout(() => ctx.close(), 1000);
  } catch {}
};

// ── localStorage helpers ──────────────────────────────────────────
const STORAGE_KEY_PROGRESS = "wise-floor-step-progress";
const STORAGE_KEY_WRONG = "wise-floor-wrong-answers";

const loadProgress = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROGRESS);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

const saveProgress = (progress) => {
  try { localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(progress)); } catch {}
};

const loadWrongAnswers = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WRONG);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

const saveWrongAnswers = (wrong) => {
  try { localStorage.setItem(STORAGE_KEY_WRONG, JSON.stringify(wrong)); } catch {}
};

// ── APP ────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("join"); // join | floor | input | duel
  const [studyCategory, setStudyCategory] = useState(null);
  const [studyStep, setStudyStep] = useState(1); // 1-6
  const [stepProgress, setStepProgress] = useState(() => loadProgress()); // { animals: 6, food: 1 }
  const [wrongAnswers, setWrongAnswers] = useState(() => loadWrongAnswers()); // { "animals:elephant": 3, ... }
  // Step 1: Flashcard
  const [studyRevealed, setStudyRevealed] = useState(false);
  const [studyDeck, setStudyDeck] = useState([]);
  const [studyDone, setStudyDone] = useState([]);
  // Step 2: Cloze
  const [clozeQueue, setClozeQueue] = useState([]);
  const [clozeChoices, setClozeChoices] = useState([]);
  const [clozeFeedback, setClozeFeedback] = useState(null);
  const [clozeInput, setClozeInput] = useState("");
  // Step 3: Picture Quiz
  const [quizQueue, setQuizQueue] = useState([]);
  const [quizChoices, setQuizChoices] = useState([]);
  const [quizFeedback, setQuizFeedback] = useState(null);
  const [quizMode, setQuizMode] = useState(null);
  // Classroom duel
  const [classroomDuel, setClassroomDuel] = useState(null); // { p1, p2, category, questions, qIdx, active, p1Time, p2Time }
  const [duelSetup, setDuelSetup] = useState(null); // { p1: "", p2: "", category: "" } or null
  // Step 4-6: Sound Track
  const [listenPhase, setListenPhase] = useState("listen"); // Step 5: "listen" | "answer"
  const [playedIdxs, setPlayedIdxs] = useState(new Set());  // Step 5: which buttons played
  const [soundQueue, setSoundQueue] = useState([]);
  const [soundChoices, setSoundChoices] = useState([]);
  const [soundFeedback, setSoundFeedback] = useState(null);
  const [spellInput, setSpellInput] = useState("");
  const [spellHint, setSpellHint] = useState("");
  const [quizStreak, setQuizStreak] = useState(0);
  const [showStreakPopup, setShowStreakPopup] = useState(false);
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

  useEffect(() => {
    if (window.WiseXP) window.WiseXP.init('wise-english-floor');
  }, []);

  const showNotif = useCallback((msg) => {
    setNotification(msg);
    clearTimeout(notifTimeout.current);
    notifTimeout.current = setTimeout(() => setNotification(null), 3000);
  }, []);

  // Persist stepProgress to localStorage
  useEffect(() => {
    saveProgress(stepProgress);
  }, [stepProgress]);

  // Persist wrongAnswers to localStorage
  useEffect(() => {
    saveWrongAnswers(wrongAnswers);
  }, [wrongAnswers]);

  // Helper: record a wrong answer
  const recordWrong = useCallback((category, answer) => {
    const key = `${category}:${answer}`;
    setWrongAnswers(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    if (window.WiseXP) window.WiseXP.reportWrong({ question: category, correct: answer, playerAnswer: '' });
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

  // Classroom duel timer
  useEffect(() => {
    if (screen !== "classroom-duel" || !classroomDuel || classroomDuel.ended) return;
    const timer = setInterval(() => {
      setClassroomDuel(prev => {
        if (!prev || prev.ended) return prev;
        if (prev.active === 1) {
          const next = prev.p1Time - 1;
          if (next <= 0) return { ...prev, p1Time: 0, ended: true, winner: prev.p2 };
          return { ...prev, p1Time: next };
        } else {
          const next = prev.p2Time - 1;
          if (next <= 0) return { ...prev, p2Time: 0, ended: true, winner: prev.p1 };
          return { ...prev, p2Time: next };
        }
      });
    }, 100);
    return () => clearInterval(timer);
  }, [screen, classroomDuel?.active, classroomDuel?.ended]);

  // ── PartySocket connection ──────────────────────────────────────
  const socket = usePartySocket({
    host: HOST,
    room: roomCode || "__waiting__",
    startClosed: !roomCode,
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

  // ── Step helpers ─────────────────────────────────────────────────
  const startStep = (cat, step) => {
    setStudyCategory(cat);
    setStudyStep(step);
    const items = shuffle([...QDB[cat]]);
    if (step === 1) {
      setStudyDeck(items);
      setStudyDone([]);
      setStudyRevealed(false);
    } else if (step === 2) {
      const q = items[0];
      const others = QDB[cat].filter(x => x.answer !== q.answer);
      setClozeQueue(items);
      setClozeChoices(shuffle([q, ...shuffle(others).slice(0, 3)]));
      setClozeFeedback(null);
      setClozeInput("");
    } else if (step === 3) {
      const mode = Math.random() > 0.5 ? "pic2word" : "word2pic";
      setQuizQueue(items);
      setQuizMode(mode);
      setQuizFeedback(null);
      setupQuizChoices(items[0], cat, mode);
    } else if (step === 4 || step === 5) {
      // B-1: Sound→Meaning (4択 画像/意味), B-2: Meaning→Sound (4つの音声ボタン)
      setSoundQueue(items);
      setSoundFeedback(null);
      setListenPhase("listen");
      setPlayedIdxs(new Set());
      const others = QDB[cat].filter(x => x.answer !== items[0].answer);
      setSoundChoices(shuffle([items[0], ...shuffle(others).slice(0, 3)]));
    } else if (step === 6) {
      // B-3: Sound→Spelling
      setSoundQueue(items);
      setSoundFeedback(null);
      setSpellInput("");
      setSpellHint(items[0].answer[0]);
    }
  };

  const setupQuizChoices = (item, cat, mode) => {
    const others = QDB[cat].filter(x => x.answer !== item.answer);
    const distractors = shuffle(others).slice(0, 3);
    setQuizChoices(shuffle([item, ...distractors]));
    setQuizMode(mode);
    setQuizFeedback(null);
  };

  const completeStep = (cat, step) => {
    setStepProgress(prev => ({ ...prev, [cat]: Math.max(prev[cat] || 0, step) }));
    setQuizStreak(0);
    try { socket.send(JSON.stringify({ type: "step_complete", category: cat, step })); } catch {}
    if (step < 6) {
      startStep(cat, step + 1);
    } else {
      setStudyCategory(null);
      if (window.WiseXP) window.WiseXP.reportGame({ score: 6, correct: 6, total: 6, maxCombo: 0, grade: cat });
    }
  };

  const enterCategory = (cat) => {
    const done = stepProgress[cat] || 0;
    startStep(cat, Math.min(done + 1, 6));
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
        playSFX("correct");
        setDuelLocal(prev => prev ? { ...prev, feedback: "correct", input: "" } : null);
        setTimeout(() => {
          socket.send(JSON.stringify({ type: "switch_turn" }));
          setDuelLocal(prev => prev ? { ...prev, feedback: null } : null);
          setSpokenText("");
        }, 800);
      } else {
        playSFX("wrong");
        recordWrong(duelLocal?.category, q.answer);
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
      playSFX("correct");
      setDuelLocal(prev => ({ ...prev, feedback: "correct", input: "" }));
      setTimeout(() => {
        socket.send(JSON.stringify({ type: "switch_turn" }));
        setDuelLocal(prev => prev && ({ ...prev, feedback: null }));
        setTimeout(() => inputRef.current?.focus(), 50);
      }, 600);
    } else {
      playSFX("wrong");
      recordWrong(duelLocal?.category, q.answer);
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
          ENGLISH VOCABULARY BATTLE
        </p>
      </div>

      {/* Classroom Mode — main button */}
      <div style={{ ...styles.card, alignItems: "center", marginBottom: 20 }}>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem", marginBottom: 16, textAlign: "center" }}>
          Start learning on this screen. Students watch the projector.
        </p>
        <button style={{
          ...styles.btn, width: "100%", padding: "16px",
          fontSize: "1rem", background: "linear-gradient(135deg, #2ed573, #10b981)",
        }} onClick={() => {
          setIsTeacher(true);
          setScreen("input");
        }}>
          CLASSROOM MODE
        </button>
      </div>

      {/* Online Mode — secondary */}
      <details style={{ width: "100%", maxWidth: 380 }}>
        <summary style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem", cursor: "pointer", marginBottom: 10 }}>
          Online multiplayer mode
        </summary>
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
              I'm the teacher
            </label>
          </div>
          <button style={styles.btn} onClick={handleJoin}
            disabled={!myName.trim() || !roomCode.trim()}>
            JOIN ROOM
          </button>
        </div>
      </details>
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

    // ── Teacher dashboard (only in online mode with students) ──
    if (isTeacher && students.length > 0 && gameState?.status === "input") {
      const totalSteps = students.reduce((sum, s) => {
        const p = progress[s.id] || {};
        return sum + Object.values(p).reduce((a, b) => a + b, 0);
      }, 0);
      const totalPossible = students.length * catKeys.length * 6;
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
              {totalSteps} / {totalPossible}
            </div>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem" }}>steps completed</p>
          </div>

          {/* Per-student progress */}
          <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {students.map(s => {
              const sp = progress[s.id] || {};
              return (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 12,
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${s.color}30`,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
                  <span style={{ color: s.color, fontWeight: 600, fontSize: "0.8rem", minWidth: 55 }}>{s.name}</span>
                  <div style={{ display: "flex", gap: 6, flex: 1 }}>
                    {catKeys.map(key => {
                      const step = sp[key] || 0;
                      const cat = CATS[key];
                      return (
                        <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: "0.55rem", color: cat.color }}>{cat.icon}</span>
                          <div style={{ display: "flex", gap: 1 }}>
                            {[1, 2, 3, 4, 5, 6].map(i => (
                              <div key={i} style={{
                                width: 6, height: 6, borderRadius: "50%",
                                background: i <= step ? cat.color : "rgba(255,255,255,0.1)",
                              }} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
          <button onClick={() => { setScreen("floor"); }}
            style={{ ...styles.passBtn, position: "fixed", top: 12, left: 12, padding: "6px 12px", fontSize: "0.65rem", zIndex: 999 }}>
            LEAVE
          </button>

          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ ...styles.title, fontSize: "clamp(1.4rem,5vw,1.8rem)" }}>STUDY TIME</div>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem", marginTop: 4 }}>
              Choose a category to learn
            </p>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
            gap: 10, width: "100%", maxWidth: 500,
          }}>
            {catKeys.map(key => {
              const cat = CATS[key];
              const done = stepProgress[key] || 0;
              return (
                <button key={key}
                  onClick={() => enterCategory(key)}
                  style={{
                    padding: "24px 14px", borderRadius: 14,
                    background: done >= 3 ? `${cat.color}18` : "rgba(255,255,255,0.04)",
                    border: `2px solid ${done >= 6 ? cat.color + "70" : cat.color + "30"}`,
                    cursor: "pointer", display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 6, position: "relative",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>{cat.icon}</span>
                  <span style={{ fontSize: "clamp(0.8rem, 2vw, 1.1rem)", fontWeight: 700, color: cat.color, textTransform: "uppercase" }}>
                    {cat.label}
                  </span>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: i <= done ? cat.color : "rgba(255,255,255,0.15)",
                      }} />
                    ))}
                  </div>
                  {done >= 3 && (
                    <span style={{ position: "absolute", top: 4, right: 6, fontSize: "0.6rem", color: "#2ed573", fontWeight: 700 }}>READY</span>
                  )}
                </button>
              );
            })}
          </div>

          <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.7rem", marginTop: 16 }}>
            6 steps: Flashcard → Cloze → Picture → Sound → Meaning → Spelling
          </p>

          {/* Wrong answers review */}
          {Object.keys(wrongAnswers).length > 0 && (
            <details style={{ width: "100%", maxWidth: 500, marginTop: 16 }}>
              <summary style={{
                color: "#ff6b81", fontSize: "0.8rem", cursor: "pointer", fontWeight: 600,
                padding: "8px 0",
              }}>
                Wrong answers ({Object.values(wrongAnswers).reduce((a, b) => a + b, 0)} mistakes)
              </summary>
              <div style={{
                background: "rgba(255,71,87,0.06)", border: "1px solid rgba(255,71,87,0.2)",
                borderRadius: 12, padding: "12px 16px", marginTop: 6,
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                {Object.entries(wrongAnswers)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 20)
                  .map(([key, count]) => {
                    const [cat, word] = key.split(":");
                    const catInfo2 = CATS[cat];
                    const qItem = QDB[cat]?.find(q2 => q2.answer === word);
                    return (
                      <div key={key} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "4px 8px", borderRadius: 8,
                        background: "rgba(255,255,255,0.03)",
                      }}>
                        <span style={{ fontSize: "0.65rem", color: catInfo2?.color || "#fff" }}>{catInfo2?.icon}</span>
                        <span style={{ color: "white", fontSize: "0.8rem", fontWeight: 600, flex: 1 }}>{word}</span>
                        {qItem && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.7rem" }}>{qItem.meaning}</span>}
                        <span style={{ color: "#ff4757", fontSize: "0.7rem", fontWeight: 700, minWidth: 20, textAlign: "right" }}>x{count}</span>
                        <button onClick={() => speakWord(word)} style={{
                          background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem", padding: "2px 4px",
                        }}>🔊</button>
                      </div>
                    );
                  })}
                <button onClick={() => { setWrongAnswers({}); }} style={{
                  ...styles.passBtn, marginTop: 6, padding: "6px 12px",
                  fontSize: "0.65rem", color: "rgba(255,255,255,0.3)",
                  alignSelf: "center",
                }}>
                  Clear history
                </button>
              </div>
            </details>
          )}

          {/* DUEL button */}
          <button onClick={() => setDuelSetup({ p1: "", p2: "", category: catKeys[0] })}
            style={{
              ...styles.btn, marginTop: 20, maxWidth: 500, padding: "18px 20px",
              background: "linear-gradient(135deg, #ff4757, #ff6b81)",
              fontSize: "clamp(1rem, 2.5vw, 1.3rem)",
            }}>
            DUEL
          </button>

          {/* Skip mode for advanced students */}
          <button onClick={() => {
            const all = {};
            catKeys.forEach(k => { all[k] = 6; });
            setStepProgress(all);
            catKeys.forEach(k => {
              try { socket.send(JSON.stringify({ type: "step_complete", category: k, step: 6 })); } catch {}
            });
            showNotif("All steps skipped — ready for duel!");
          }} style={{
            ...styles.passBtn, marginTop: 12, padding: "10px 20px",
            fontSize: "0.75rem", color: "rgba(255,255,255,0.35)",
          }}>
            SKIP ALL (advanced)
          </button>
        </div>
      );
    }

    // ── Duel setup screen ──
    if (duelSetup) {
      return (
        <div style={styles.page}>
          <button onClick={() => setDuelSetup(null)}
            style={{ ...styles.passBtn, position: "fixed", top: 12, left: 12, padding: "6px 12px", fontSize: "0.65rem", zIndex: 999 }}>
            Back
          </button>
          <div style={{ ...styles.title, fontSize: "clamp(1.4rem, 5vw, 2rem)", marginBottom: 20 }}>DUEL SETUP</div>
          <div style={{ ...styles.card, gap: 14, maxWidth: 500 }}>
            <label style={styles.label}>PLAYER 1</label>
            <input style={styles.input} placeholder="Name" value={duelSetup.p1}
              onChange={e => setDuelSetup(prev => ({ ...prev, p1: e.target.value }))} />
            <label style={styles.label}>PLAYER 2</label>
            <input style={styles.input} placeholder="Name" value={duelSetup.p2}
              onChange={e => setDuelSetup(prev => ({ ...prev, p2: e.target.value }))} />
            <label style={styles.label}>CATEGORY</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {catKeys.map(key => {
                const cat = CATS[key];
                const selected = duelSetup.category === key;
                return (
                  <button key={key} onClick={() => setDuelSetup(prev => ({ ...prev, category: key }))}
                    style={{
                      padding: "8px 14px", borderRadius: 10, cursor: "pointer",
                      background: selected ? `${cat.color}30` : "rgba(255,255,255,0.04)",
                      border: `2px solid ${selected ? cat.color : "rgba(255,255,255,0.1)"}`,
                      color: selected ? cat.color : "rgba(255,255,255,0.4)",
                      fontSize: "0.8rem", fontWeight: 600, fontFamily: "inherit",
                    }}>
                    {cat.icon} {cat.label}
                  </button>
                );
              })}
            </div>
            <button
              disabled={!duelSetup.p1.trim() || !duelSetup.p2.trim()}
              onClick={() => {
                const cat = duelSetup.category;
                const questions = shuffle([...QDB[cat]]);
                setClassroomDuel({
                  p1: duelSetup.p1.trim(), p2: duelSetup.p2.trim(),
                  category: cat, questions, qIdx: 0,
                  active: 1, p1Time: 450, p2Time: 450, ended: false, winner: null,
                });
                setDuelSetup(null);
                setScreen("classroom-duel");
              }}
              style={{
                ...styles.btn, padding: "16px",
                background: "linear-gradient(135deg, #ff4757, #ff6b81)",
                opacity: (!duelSetup.p1.trim() || !duelSetup.p2.trim()) ? 0.4 : 1,
              }}>
              START DUEL
            </button>
          </div>
        </div>
      );
    }

    // ── Step header (shared) ──
    const catInfo = CATS[studyCategory];
    const stepLabels = { 1: "Flashcard", 2: "Cloze", 3: "Picture Quiz", 4: "Sound→Meaning", 5: "Meaning→Sound", 6: "Sound→Spelling" };

    const streakPopup = showStreakPopup && (
      <div style={{
        position: "fixed", top: "30%", left: "50%", transform: "translate(-50%, -50%)",
        zIndex: 1000, background: "rgba(0,0,0,0.85)", borderRadius: 20,
        padding: "16px 32px", textAlign: "center",
        border: "2px solid #FFD700", animation: "slideIn 0.3s ease-out",
      }}>
        <div style={{ fontSize: "2rem", marginBottom: 4 }}>
          {quizStreak >= 9 ? "\uD83D\uDD25" : quizStreak >= 6 ? "\u2B50" : "\uD83C\uDF1F"}
        </div>
        <div style={{ color: "#FFD700", fontWeight: 900, fontSize: "1.2rem" }}>
          {quizStreak} COMBO!
        </div>
      </div>
    );

    const stepHeader = (
      <div style={{ textAlign: "center", marginBottom: 12, width: "100%" }}>
        {streakPopup}
        <button onClick={() => setStudyCategory(null)}
          style={{ ...styles.passBtn, position: "fixed", top: 12, left: 12, padding: "6px 12px", fontSize: "0.65rem", zIndex: 999 }}>
          Back
        </button>
        <div style={{
          padding: "5px 16px", display: "inline-block",
          background: `${catInfo.color}18`, border: `1.5px solid ${catInfo.color}50`,
          borderRadius: 24, fontSize: "0.72rem", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.12em", color: catInfo.color,
        }}>
          {catInfo.icon} {catInfo.label} — Step {studyStep}: {stepLabels[studyStep]}
        </div>
        <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 8 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{
              width: 24, height: 4, borderRadius: 2,
              background: i <= studyStep ? catInfo.color : "rgba(255,255,255,0.12)",
            }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 6 }}>
          <button onClick={() => completeStep(studyCategory, studyStep)}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", fontSize: "0.6rem", cursor: "pointer", fontFamily: "inherit" }}>
            skip this step
          </button>
          <button onClick={() => { setStudyCategory(null); setDuelSetup({ p1: "", p2: "", category: studyCategory }); }}
            style={{ background: "none", border: "none", color: "#ff475780", fontSize: "0.6rem", cursor: "pointer", fontFamily: "inherit" }}>
            go to duel
          </button>
        </div>
      </div>
    );

    // ════════════════════════════════════════════════════════════════
    // STEP 1: Enhanced Flashcard (わかった / もう一度)
    // ════════════════════════════════════════════════════════════════
    if (studyStep === 1) {
      const currentCard = studyDeck[0];
      if (!currentCard) {
        // All done — complete step
        return (
          <div style={{ ...styles.page, justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: 10 }}>🎉</div>
              <div style={{ ...styles.title, fontSize: "1.5rem" }}>Step 1 Complete!</div>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem", margin: "10px 0 20px" }}>
                {studyDone.length} words learned
              </p>
              <button style={styles.btn} onClick={() => completeStep(studyCategory, 1)}>
                Next: Cloze Quiz
              </button>
            </div>
          </div>
        );
      }
      return (
        <div style={styles.page}>
          {stepHeader}
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem", marginBottom: 12 }}>
            {studyDone.length} learned / {studyDeck.length} remaining
          </p>

          {/* Flashcard */}
          <div onClick={() => { if (!studyRevealed) { setStudyRevealed(true); speakWord(currentCard.answer); } }}
            style={{
              width: "min(500px, 90vw)", minHeight: 320, borderRadius: 20,
              background: "rgba(255,255,255,0.04)", border: `2px solid ${catInfo.color}40`,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              cursor: studyRevealed ? "default" : "pointer",
              padding: 20, marginBottom: 16,
            }}
          >
            <img src={currentCard.img} alt="" style={{
              width: "clamp(160px, 30vw, 280px)", height: "clamp(160px, 30vw, 280px)",
              objectFit: "cover", borderRadius: 16, marginBottom: 12,
            }} />
            {studyRevealed ? (
              <>
                <div style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 700, color: catInfo.color, marginBottom: 4 }}>
                  {currentCard.answer}
                </div>
                <div style={{ fontSize: "clamp(1rem, 2.5vw, 1.4rem)", color: "rgba(255,255,255,0.5)" }}>
                  {currentCard.meaning}
                </div>
                <button onClick={(e) => { e.stopPropagation(); speakWord(currentCard.answer); }}
                  style={{ marginTop: 8, background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer" }}>
                  🔊
                </button>
              </>
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

          {/* わかった / もう一度 */}
          {studyRevealed && (
            <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 500 }}>
              <button onClick={() => {
                setStudyDeck(prev => prev.slice(1));
                setStudyRevealed(false);
              }} style={{
                ...styles.passBtn, flex: 1, padding: "12px 8px",
                color: "#ffa502", border: "1.5px solid rgba(255,165,0,0.3)",
                fontSize: "0.8rem",
              }}>
                もう一度
              </button>
              <button onClick={() => {
                setStudyDone(prev => [...prev, currentCard]);
                setStudyDeck(prev => prev.slice(1));
                setStudyRevealed(false);
              }} style={{
                ...styles.btn, flex: 1, padding: "12px 8px",
                background: "linear-gradient(135deg, #2ed573, #10b981)",
                fontSize: "0.8rem",
              }}>
                わかった
              </button>
            </div>
          )}
          <style>{`@keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }`}</style>
        </div>
      );
    }

    // ════════════════════════════════════════════════════════════════
    // STEP 2: Cloze Flashcard (4択)
    // ════════════════════════════════════════════════════════════════
    if (studyStep === 2) {
      const current = clozeQueue[0];
      if (!current) {
        return (
          <div style={{ ...styles.page, justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: 10 }}>🎉</div>
              <div style={{ ...styles.title, fontSize: "1.5rem" }}>Step 2 Complete!</div>
              <button style={{ ...styles.btn, marginTop: 20 }} onClick={() => completeStep(studyCategory, 2)}>
                Next: Picture Quiz
              </button>
            </div>
          </div>
        );
      }

      return (
        <div style={styles.page}>
          {stepHeader}
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem", marginBottom: 12 }}>
            {clozeQueue.length} remaining
          </p>

          {/* Show image */}
          <img src={current.img} alt="" style={{
            width: "clamp(160px, 28vw, 260px)", height: "clamp(160px, 28vw, 260px)",
            objectFit: "cover", borderRadius: 16, marginBottom: 10,
          }} />

          {/* Hint */}
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", marginBottom: 4 }}>
            {current.meaning}
          </p>
          <p style={{ color: catInfo.color, fontSize: "0.75rem", marginBottom: 16, fontWeight: 600 }}>
            {current.answer[0]}{"_".repeat(current.answer.length - 1)} ?
          </p>

          {/* 4 choices */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", maxWidth: 500 }}>
            {clozeChoices.map(choice => {
              const isCorrect = choice.answer === current.answer;
              const showGreen = clozeFeedback && isCorrect;
              const showRed = clozeFeedback === choice.answer && !isCorrect;
              return (
                <button key={choice.answer}
                  disabled={!!clozeFeedback}
                  onClick={() => {
                    if (isCorrect) {
                      setClozeFeedback(choice.answer);
                      speakWord(choice.answer);
                      playSFX("correct");
                      const newStreak = quizStreak + 1;
                      setQuizStreak(newStreak);
                      if (newStreak >= 3 && newStreak % 3 === 0) {
                        setShowStreakPopup(true);
                        setTimeout(() => setShowStreakPopup(false), 1200);
                      }
                      setTimeout(() => {
                        const next = clozeQueue.slice(1);
                        setClozeQueue(next);
                        if (next.length > 0) {
                          const others = QDB[studyCategory].filter(x => x.answer !== next[0].answer);
                          setClozeChoices(shuffle([next[0], ...shuffle(others).slice(0, 3)]));
                        }
                        setClozeFeedback(null);
                      }, 800);
                    } else {
                      setClozeFeedback(choice.answer);
                      playSFX("wrong");
                      setQuizStreak(0);
                      recordWrong(studyCategory, current.answer);
                      setTimeout(() => {
                        // Move to end of queue
                        setClozeQueue(prev => [...prev.slice(1), prev[0]]);
                        const next0 = clozeQueue[1] || clozeQueue[0];
                        const others = QDB[studyCategory].filter(x => x.answer !== next0.answer);
                        setClozeChoices(shuffle([next0, ...shuffle(others).slice(0, 3)]));
                        setClozeFeedback(null);
                      }, 1000);
                    }
                  }}
                  style={{
                    padding: "12px 8px", borderRadius: 12,
                    background: showGreen ? "rgba(46,213,115,0.2)" : showRed ? "rgba(255,71,87,0.2)" : "rgba(255,255,255,0.06)",
                    border: `2px solid ${showGreen ? "#2ed573" : showRed ? "#ff4757" : "rgba(255,255,255,0.15)"}`,
                    color: showGreen ? "#2ed573" : showRed ? "#ff4757" : "white",
                    fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
                    fontFamily: "inherit", transition: "all 0.15s",
                  }}
                >
                  {choice.answer}
                </button>
              );
            })}
          </div>
          <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }`}</style>
        </div>
      );
    }

    // ════════════════════════════════════════════════════════════════
    // STEP 3: Picture Quiz
    // ════════════════════════════════════════════════════════════════
    if (studyStep === 3) {
      const current = quizQueue[0];
      if (!current) {
        return (
          <div style={{ ...styles.page, justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: 10 }}>🎉</div>
              <div style={{ ...styles.title, fontSize: "1.5rem" }}>Step 3 Complete!</div>
              <button style={{ ...styles.btn, marginTop: 20 }} onClick={() => completeStep(studyCategory, 3)}>
                Next: Sound → Meaning
              </button>
            </div>
          </div>
        );
      }

      const advanceQuiz = (correct) => {
        playSFX(correct ? "correct" : "wrong");
        if (correct) {
          const newStreak = quizStreak + 1;
          setQuizStreak(newStreak);
          if (newStreak >= 3 && newStreak % 3 === 0) {
            setShowStreakPopup(true);
            setTimeout(() => setShowStreakPopup(false), 1200);
          }
        } else {
          setQuizStreak(0);
        }
        if (!correct) recordWrong(studyCategory, current.answer);
        setTimeout(() => {
          if (correct) {
            const next = quizQueue.slice(1);
            setQuizQueue(next);
            if (next.length > 0) {
              const newMode = Math.random() > 0.5 ? "pic2word" : "word2pic";
              setupQuizChoices(next[0], studyCategory, newMode);
            }
          } else {
            // Move to end
            const requeued = [...quizQueue.slice(1), quizQueue[0]];
            setQuizQueue(requeued);
            const newMode = Math.random() > 0.5 ? "pic2word" : "word2pic";
            setupQuizChoices(requeued[0], studyCategory, newMode);
          }
          setQuizFeedback(null);
        }, 800);
      };

      return (
        <div style={styles.page}>
          {stepHeader}
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem", marginBottom: 12 }}>
            {quizQueue.length} remaining
          </p>

          {quizMode === "word2pic" ? (
            <>
              {/* Show word + audio, pick from 4 images */}
              <div style={{ marginBottom: 16, textAlign: "center" }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: catInfo.color, marginBottom: 4 }}>
                  {current.answer}
                </div>
                <button onClick={() => speakWord(current.answer)}
                  style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer" }}>
                  🔊
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", maxWidth: 500 }}>
                {quizChoices.map(choice => {
                  const isCorrect = choice.answer === current.answer;
                  const showGreen = quizFeedback && isCorrect;
                  const showRed = quizFeedback === choice.answer && !isCorrect;
                  return (
                    <div key={choice.answer}
                      onClick={() => {
                        if (quizFeedback) return;
                        setQuizFeedback(choice.answer);
                        if (isCorrect) speakWord(choice.answer);
                        advanceQuiz(isCorrect);
                      }}
                      style={{
                        borderRadius: 14, overflow: "hidden", cursor: "pointer",
                        border: `3px solid ${showGreen ? "#2ed573" : showRed ? "#ff4757" : "rgba(255,255,255,0.1)"}`,
                        transform: showGreen ? "scale(1.05)" : showRed ? "scale(0.95)" : "scale(1)",
                        transition: "all 0.2s",
                      }}
                    >
                      <img src={choice.img} alt="" style={{
                        width: "100%", aspectRatio: "1", objectFit: "cover", display: "block",
                      }} />
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* Show 1 image, pick from 4 words */}
              <img src={current.img} alt="" style={{
                width: "clamp(180px, 30vw, 280px)", height: "clamp(180px, 30vw, 280px)",
                objectFit: "cover", borderRadius: 16, marginBottom: 16,
              }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", maxWidth: 500 }}>
                {quizChoices.map(choice => {
                  const isCorrect = choice.answer === current.answer;
                  const showGreen = quizFeedback && isCorrect;
                  const showRed = quizFeedback === choice.answer && !isCorrect;
                  return (
                    <button key={choice.answer}
                      disabled={!!quizFeedback}
                      onClick={() => {
                        setQuizFeedback(choice.answer);
                        if (isCorrect) speakWord(choice.answer);
                        advanceQuiz(isCorrect);
                      }}
                      style={{
                        padding: "12px 8px", borderRadius: 12,
                        background: showGreen ? "rgba(46,213,115,0.2)" : showRed ? "rgba(255,71,87,0.2)" : "rgba(255,255,255,0.06)",
                        border: `2px solid ${showGreen ? "#2ed573" : showRed ? "#ff4757" : "rgba(255,255,255,0.15)"}`,
                        color: showGreen ? "#2ed573" : showRed ? "#ff4757" : "white",
                        fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
                        fontFamily: "inherit", transition: "all 0.15s",
                      }}
                    >
                      {choice.answer}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      );
    }

    // ════════════════════════════════════════════════════════════════
    // STEP 4: B-1 Sound → Meaning (音声を聞いて画像/意味を選ぶ)
    // ════════════════════════════════════════════════════════════════
    if (studyStep === 4) {
      const current = soundQueue[0];
      if (!current) {
        return (
          <div style={{ ...styles.page, justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: 10 }}>🎉</div>
              <div style={{ ...styles.title, fontSize: "1.5rem" }}>Step 4 Complete!</div>
              <button style={{ ...styles.btn, marginTop: 20 }} onClick={() => completeStep(studyCategory, 4)}>
                Next: Meaning → Sound
              </button>
            </div>
          </div>
        );
      }

      return (
        <div style={styles.page}>
          {stepHeader}
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem", marginBottom: 12 }}>
            {soundQueue.length} remaining
          </p>

          {/* Play sound button */}
          <button onClick={() => speakWord(current.answer)} style={{
            width: 80, height: 80, borderRadius: "50%", marginBottom: 16,
            background: `radial-gradient(circle, ${catInfo.color}, ${catInfo.color}cc)`,
            border: `3px solid ${catInfo.color}`, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "2rem", boxShadow: `0 0 20px ${catInfo.color}40`,
          }}>
            🔊
          </button>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.75rem", marginBottom: 20 }}>
            Listen and choose the correct image
          </p>

          {/* 4 image choices */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", maxWidth: 500 }}>
            {soundChoices.map(choice => {
              const isCorrect = choice.answer === current.answer;
              const showGreen = soundFeedback && isCorrect;
              const showRed = soundFeedback === choice.answer && !isCorrect;
              return (
                <div key={choice.answer}
                  onClick={() => {
                    if (soundFeedback) return;
                    setSoundFeedback(choice.answer);
                    playSFX(isCorrect ? "correct" : "wrong");
                    if (!isCorrect) recordWrong(studyCategory, current.answer);
                    setTimeout(() => {
                      if (isCorrect) {
                        const next = soundQueue.slice(1);
                        setSoundQueue(next);
                        if (next.length > 0) {
                          const others = QDB[studyCategory].filter(x => x.answer !== next[0].answer);
                          setSoundChoices(shuffle([next[0], ...shuffle(others).slice(0, 3)]));
                        }
                      } else {
                        const requeued = [...soundQueue.slice(1), soundQueue[0]];
                        setSoundQueue(requeued);
                        const others = QDB[studyCategory].filter(x => x.answer !== requeued[0].answer);
                        setSoundChoices(shuffle([requeued[0], ...shuffle(others).slice(0, 3)]));
                      }
                      setSoundFeedback(null);
                    }, 800);
                  }}
                  style={{
                    borderRadius: 14, overflow: "hidden", cursor: "pointer",
                    border: `3px solid ${showGreen ? "#2ed573" : showRed ? "#ff4757" : "rgba(255,255,255,0.1)"}`,
                    transform: showGreen ? "scale(1.05)" : showRed ? "scale(0.95)" : "scale(1)",
                    transition: "all 0.2s",
                  }}
                >
                  <img src={choice.img} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // ════════════════════════════════════════════════════════════════
    // STEP 5: B-2 Meaning → Sound (画像を見て正しい発音を選ぶ)
    // ════════════════════════════════════════════════════════════════
    if (studyStep === 5) {
      const current = soundQueue[0];
      if (!current) {
        return (
          <div style={{ ...styles.page, justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: 10 }}>🎉</div>
              <div style={{ ...styles.title, fontSize: "1.5rem" }}>Step 5 Complete!</div>
              <button style={{ ...styles.btn, marginTop: 20 }} onClick={() => completeStep(studyCategory, 5)}>
                Next: Sound → Spelling
              </button>
            </div>
          </div>
        );
      }

      const handleStep5Answer = (choice) => {
        if (soundFeedback) return;
        const isCorrect = choice.answer === current.answer;
        setSoundFeedback(choice.answer);
        playSFX(isCorrect ? "correct" : "wrong");
        if (!isCorrect) recordWrong(studyCategory, current.answer);
        speakWord(choice.answer);
        setTimeout(() => {
          if (isCorrect) {
            const next = soundQueue.slice(1);
            setSoundQueue(next);
            if (next.length > 0) {
              const others = QDB[studyCategory].filter(x => x.answer !== next[0].answer);
              setSoundChoices(shuffle([next[0], ...shuffle(others).slice(0, 3)]));
            }
          } else {
            const requeued = [...soundQueue.slice(1), soundQueue[0]];
            setSoundQueue(requeued);
            const others = QDB[studyCategory].filter(x => x.answer !== requeued[0].answer);
            setSoundChoices(shuffle([requeued[0], ...shuffle(others).slice(0, 3)]));
          }
          setSoundFeedback(null);
          setListenPhase("listen");
          setPlayedIdxs(new Set());
        }, 1200);
      };

      return (
        <div style={styles.page}>
          {stepHeader}
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem", marginBottom: 12 }}>
            {soundQueue.length} remaining
          </p>

          {/* Show image + meaning */}
          <img src={current.img} alt="" style={{
            width: "clamp(160px, 28vw, 260px)", height: "clamp(160px, 28vw, 260px)",
            objectFit: "cover", borderRadius: 16, marginBottom: 6,
          }} />
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "clamp(0.85rem, 2vw, 1.1rem)", marginBottom: 12 }}>
            {current.meaning}
          </p>

          {listenPhase === "listen" ? (
            <>
              <p style={{ color: catInfo.color, fontSize: "0.8rem", fontWeight: 600, marginBottom: 12 }}>
                Listen to all 4, then choose
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%", maxWidth: 500, marginBottom: 16 }}>
                {soundChoices.map((choice, idx) => (
                  <button key={choice.answer}
                    onClick={() => {
                      speakWord(choice.answer);
                      setPlayedIdxs(prev => new Set([...prev, idx]));
                    }}
                    style={{
                      padding: "20px 8px", borderRadius: 12,
                      background: playedIdxs.has(idx) ? `${catInfo.color}15` : "rgba(255,255,255,0.06)",
                      border: `2px solid ${playedIdxs.has(idx) ? catInfo.color + "50" : "rgba(255,255,255,0.15)"}`,
                      color: "white", fontSize: "1.8rem", cursor: "pointer",
                      fontFamily: "inherit", transition: "all 0.15s",
                    }}
                  >
                    🔊 <span style={{ fontSize: "0.8rem", opacity: 0.5 }}>#{idx + 1}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setListenPhase("answer")}
                style={{
                  ...styles.btn, maxWidth: 300,
                  opacity: playedIdxs.size >= 2 ? 1 : 0.4,
                }}
                disabled={playedIdxs.size < 2}
              >
                I'm ready — choose my answer
              </button>
              {playedIdxs.size < 2 && (
                <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.65rem", marginTop: 6 }}>
                  Listen to at least 2 before answering
                </p>
              )}
            </>
          ) : (
            <>
              <p style={{ color: "#ffa502", fontSize: "0.8rem", fontWeight: 600, marginBottom: 12 }}>
                Which one matches the picture? Tap to answer.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%", maxWidth: 500 }}>
                {soundChoices.map((choice, idx) => {
                  const isCorrect = choice.answer === current.answer;
                  const showGreen = soundFeedback && isCorrect;
                  const showRed = soundFeedback === choice.answer && !isCorrect;
                  return (
                    <button key={choice.answer}
                      onClick={() => {
                        speakWord(choice.answer);
                        handleStep5Answer(choice);
                      }}
                      disabled={!!soundFeedback}
                      style={{
                        padding: "20px 8px", borderRadius: 12,
                        background: showGreen ? "rgba(46,213,115,0.25)" : showRed ? "rgba(255,71,87,0.25)" : "rgba(255,255,255,0.06)",
                        border: `2px solid ${showGreen ? "#2ed573" : showRed ? "#ff4757" : "#ffa50260"}`,
                        color: showGreen ? "#2ed573" : showRed ? "#ff4757" : "white",
                        fontSize: "1.8rem", cursor: "pointer",
                        fontFamily: "inherit", transition: "all 0.15s",
                      }}
                    >
                      🔊 <span style={{ fontSize: "0.8rem" }}>
                        {showGreen || showRed ? choice.answer : `#${idx + 1}`}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setListenPhase("listen")}
                style={{ ...styles.passBtn, marginTop: 12, fontSize: "0.7rem" }}>
                Listen again
              </button>
            </>
          )}
        </div>
      );
    }

    // ════════════════════════════════════════════════════════════════
    // STEP 6: B-3 Sound → Spelling (音声を聞いてスペルを入力)
    // ════════════════════════════════════════════════════════════════
    if (studyStep === 6) {
      const current = soundQueue[0];
      if (!current) {
        return (
          <div style={{ ...styles.page, justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: 10 }}>🏆</div>
              <div style={{ ...styles.title, fontSize: "1.5rem" }}>All 6 Steps Complete!</div>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem", margin: "10px 0 20px" }}>
                {catInfo.icon} {catInfo.label} — Mastered!
              </p>
              <button style={styles.btn} onClick={() => completeStep(studyCategory, 6)}>
                Choose another category
              </button>
            </div>
          </div>
        );
      }

      return (
        <div style={styles.page}>
          {stepHeader}
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.7rem", marginBottom: 12 }}>
            {soundQueue.length} remaining
          </p>

          {/* Play sound */}
          <button onClick={() => speakWord(current.answer)} style={{
            width: 80, height: 80, borderRadius: "50%", marginBottom: 12,
            background: `radial-gradient(circle, ${catInfo.color}, ${catInfo.color}cc)`,
            border: `3px solid ${catInfo.color}`, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "2rem", boxShadow: `0 0 20px ${catInfo.color}40`,
          }}>
            🔊
          </button>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.75rem", marginBottom: 6 }}>
            Listen and type the word
          </p>

          {/* Hint */}
          <p style={{ color: catInfo.color, fontSize: "0.8rem", fontWeight: 600, marginBottom: 12 }}>
            Hint: {spellHint}{"_".repeat(Math.max(0, current.answer.length - spellHint.length))}
          </p>

          {/* Text input */}
          <input
            value={spellInput}
            onChange={e => setSpellInput(e.target.value)}
            onKeyDown={e => {
              if (e.key !== "Enter") return;
              const correct = spellInput.toLowerCase().trim() === current.answer.toLowerCase();
              setSoundFeedback(correct ? "correct" : "wrong");
              playSFX(correct ? "correct" : "wrong");
              if (correct) speakWord(current.answer);
              if (!correct) recordWrong(studyCategory, current.answer);
              setTimeout(() => {
                if (correct) {
                  const next = soundQueue.slice(1);
                  setSoundQueue(next);
                  if (next.length > 0) {
                    setSpellHint(next[0].answer[0]);
                  }
                } else {
                  // Show more hint letters and requeue
                  const nextHintLen = Math.min(spellHint.length + 1, current.answer.length - 1);
                  setSpellHint(current.answer.slice(0, nextHintLen));
                  const requeued = [...soundQueue.slice(1), soundQueue[0]];
                  setSoundQueue(requeued);
                  if (requeued[0].answer !== current.answer) {
                    setSpellHint(requeued[0].answer[0]);
                  }
                }
                setSpellInput("");
                setSoundFeedback(null);
              }, 1000);
            }}
            placeholder="Type the word..."
            autoComplete="off" spellCheck={false}
            style={{
              ...styles.ansInput, maxWidth: 280, padding: "12px 18px", fontSize: "1.1rem", marginBottom: 10,
              background: soundFeedback === "correct" ? "rgba(46,213,115,0.1)" : soundFeedback === "wrong" ? "rgba(255,71,87,0.1)" : "rgba(255,255,255,0.07)",
              border: `2px solid ${soundFeedback === "correct" ? "#2ed573" : soundFeedback === "wrong" ? "#ff4757" : "rgba(255,255,255,0.18)"}`,
            }}
          />
          <button style={styles.btn} onClick={() => {
            if (soundFeedback) return;
            const correct = spellInput.toLowerCase().trim() === current.answer.toLowerCase();
            setSoundFeedback(correct ? "correct" : "wrong");
            playSFX(correct ? "correct" : "wrong");
            if (correct) speakWord(current.answer);
            if (!correct) recordWrong(studyCategory, current.answer);
            setTimeout(() => {
              if (correct) {
                const next = soundQueue.slice(1);
                setSoundQueue(next);
                if (next.length > 0) setSpellHint(next[0].answer[0]);
              } else {
                const nextHintLen = Math.min(spellHint.length + 1, current.answer.length - 1);
                setSpellHint(current.answer.slice(0, nextHintLen));
                const requeued = [...soundQueue.slice(1), soundQueue[0]];
                setSoundQueue(requeued);
                if (requeued[0].answer !== current.answer) setSpellHint(requeued[0].answer[0]);
              }
              setSpellInput("");
              setSoundFeedback(null);
            }, 1000);
          }}>
            CHECK
          </button>

          {soundFeedback === "correct" && <p style={{ color: "#2ed573", fontSize: "0.85rem", fontWeight: 700, marginTop: 8 }}>Correct!</p>}
          {soundFeedback === "wrong" && <p style={{ color: "#ff4757", fontSize: "0.85rem", fontWeight: 700, marginTop: 8 }}>Try again — more hint added!</p>}
        </div>
      );
    }
  }

  if (screen === "classroom-duel" && classroomDuel) {
    const d = classroomDuel;
    const q = d.questions[d.qIdx % d.questions.length];
    const catInfo = CATS[d.category];
    const activeIsP1 = d.active === 1;

    // Teacher taps = correct, switch turn
    const handleDuelTap = () => {
      if (d.ended) return;
      playSFX("correct");
      setClassroomDuel(prev => ({
        ...prev,
        active: prev.active === 1 ? 2 : 1,
        qIdx: prev.qIdx + 1,
      }));
    };

    if (d.ended) {
      return (
        <div style={styles.tvPage}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "5rem", marginBottom: 10 }}>🏆</div>
              <div style={{ ...styles.title, fontSize: "clamp(2rem, 6vw, 3rem)" }}>
                {d.winner} WINS!
              </div>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "1rem", margin: "16px 0" }}>
                {d.p1} {fmtTime(d.p1Time)} — {d.p2} {fmtTime(d.p2Time)}
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
                <button style={styles.btn} onClick={() => {
                  // Rematch
                  const questions = shuffle([...QDB[d.category]]);
                  setClassroomDuel({
                    p1: d.p1, p2: d.p2, category: d.category,
                    questions, qIdx: 0, active: 1, p1Time: 450, p2Time: 450, ended: false, winner: null,
                  });
                }}>
                  REMATCH
                </button>
                <button style={styles.passBtn} onClick={() => { setClassroomDuel(null); setScreen("input"); }}>
                  BACK
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={styles.tvPage}>
        {/* Tap the question area to switch turn */}
        <div onClick={handleDuelTap} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          width: "100%", cursor: "pointer", userSelect: "none", WebkitTapHighlightColor: "transparent",
        }}>
          <div style={{
            width: "min(85vw, 550px)", height: "min(60vh, 440px)",
            background: "linear-gradient(180deg, #fffbe6 0%, #fff3c4 100%)",
            borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 40px rgba(0,0,0,0.4), inset 0 0 80px rgba(255,255,255,0.3)",
            border: "3px solid rgba(255,255,255,0.2)", position: "relative",
          }}>
            <img src={q.img} alt="" style={{ maxWidth: "80%", maxHeight: "80%", objectFit: "contain", borderRadius: 16 }} />
            <div style={{
              position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
              padding: "4px 14px", borderRadius: 12,
              background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
              fontSize: "0.75rem", color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap",
            }}>
              Tap = correct, switch turn
            </div>
          </div>
        </div>

        {/* Bottom bar — THE FLOOR style */}
        <div style={{ width: "100%", display: "flex", alignItems: "stretch", height: 90, position: "relative" }}>
          {/* P1 */}
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px",
            background: activeIsP1 ? "linear-gradient(90deg, #00d4ff50, #00d4ff20)" : "rgba(255,255,255,0.04)",
            borderTop: "3px solid #00d4ff", transition: "background 0.3s",
          }}>
            <div>
              <div style={{
                fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em",
                color: activeIsP1 ? "#00d4ff" : "rgba(255,255,255,0.3)",
                animation: activeIsP1 ? "blink 1.1s ease-in-out infinite" : "none",
              }}>
                {activeIsP1 ? "ANSWERING" : "WAITING"}
              </div>
              <div style={{ fontSize: "clamp(1rem, 2.5vw, 1.3rem)", fontWeight: 700, color: "#00d4ff" }}>
                {d.p1}
              </div>
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: "clamp(1.8rem, 5vw, 2.8rem)", fontWeight: 700,
              color: d.p1Time < 100 ? "#ff4757" : "#00d4ff",
            }}>
              {fmtTime(d.p1Time)}
            </div>
          </div>

          {/* Category badge */}
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

          <div style={{ width: 2, background: "rgba(255,255,255,0.15)" }} />

          {/* P2 */}
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px",
            background: !activeIsP1 ? "linear-gradient(270deg, #ff475750, #ff475720)" : "rgba(255,255,255,0.04)",
            borderTop: "3px solid #ff4757", transition: "background 0.3s",
          }}>
            <div style={{
              fontFamily: "monospace", fontSize: "clamp(1.8rem, 5vw, 2.8rem)", fontWeight: 700,
              color: d.p2Time < 100 ? "#ff4757" : "#ff4757",
            }}>
              {fmtTime(d.p2Time)}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{
                fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em",
                color: !activeIsP1 ? "#ff4757" : "rgba(255,255,255,0.3)",
                animation: !activeIsP1 ? "blink 1.1s ease-in-out infinite" : "none",
              }}>
                {!activeIsP1 ? "ANSWERING" : "WAITING"}
              </div>
              <div style={{ fontSize: "clamp(1rem, 2.5vw, 1.3rem)", fontWeight: 700, color: "#ff4757" }}>
                {d.p2}
              </div>
            </div>
          </div>
        </div>
        <style>{`@keyframes blink { 0%,100%{opacity:0.2} 50%{opacity:1} }`}</style>
      </div>
    );
  }

  // ── DUEL (online mode) ──────────────────────────────────────────────
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
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "100vw",
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
    maxWidth: 520,
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
    padding: "16px 20px",
    background: "linear-gradient(135deg, #00d4ff, #0096ff)",
    color: "#000",
    border: "none",
    borderRadius: 12,
    fontSize: "clamp(0.9rem, 2vw, 1.1rem)",
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
    maxWidth: 500,
    padding: "16px 24px",
    borderRadius: 14,
    fontSize: "clamp(1.1rem, 2.5vw, 1.4rem)",
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
