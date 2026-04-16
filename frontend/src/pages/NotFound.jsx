import { useEffect, useRef, useState, useCallback } from "react";

const GRID_SIZE = 12; // 3 × 4 grid
const GAME_DURATION = 30; // seconds
const SPAWN_INTERVAL = 700; // ms between spawns
const TILE_LIFE = 1100; // ms a ₹ stays visible

function useGame() {
  const [phase, setPhase] = useState("idle"); // idle | playing | over
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [tiles, setTiles] = useState(Array(GRID_SIZE).fill(null)); // null | "active" | "hit"

  const spawnRef = useRef(null);
  const tickRef  = useRef(null);
  const tileTimers = useRef({});

  const clearAll = useCallback(() => {
    clearInterval(spawnRef.current);
    clearInterval(tickRef.current);
    Object.values(tileTimers.current).forEach(clearTimeout);
    tileTimers.current = {};
  }, []);

  const start = useCallback(() => {
    clearAll();
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setTiles(Array(GRID_SIZE).fill(null));
    setPhase("playing");
  }, [clearAll]);

  // Spawner
  useEffect(() => {
    if (phase !== "playing") return;

    spawnRef.current = setInterval(() => {
      setTiles(prev => {
        const empty = prev
          .map((v, i) => (v === null ? i : -1))
          .filter(i => i >= 0);
        if (!empty.length) return prev;

        const idx = empty[Math.floor(Math.random() * empty.length)];
        const next = [...prev];
        next[idx] = "active";

        // Auto-remove after TILE_LIFE
        tileTimers.current[idx] = setTimeout(() => {
          setTiles(curr => {
            if (curr[idx] !== "active") return curr;
            const n = [...curr];
            n[idx] = null;
            return n;
          });
        }, TILE_LIFE);

        return next;
      });
    }, SPAWN_INTERVAL);

    return () => clearInterval(spawnRef.current);
  }, [phase]);

  // Countdown
  useEffect(() => {
    if (phase !== "playing") return;

    tickRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearAll();
          setPhase("over");
          setTiles(Array(GRID_SIZE).fill(null));
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(tickRef.current);
  }, [phase, clearAll]);

  const tap = useCallback((idx) => {
    setTiles(prev => {
      if (prev[idx] !== "active") return prev;
      clearTimeout(tileTimers.current[idx]);
      delete tileTimers.current[idx];
      const next = [...prev];
      next[idx] = "hit";
      setTimeout(() => {
        setTiles(c => {
          const n = [...c];
          if (n[idx] === "hit") n[idx] = null;
          return n;
        });
      }, 260);
      return next;
    });
    setScore(s => s + 1);
  }, []);

  useEffect(() => () => clearAll(), [clearAll]);

  return { phase, score, timeLeft, tiles, start, tap };
}

// ── Tile colours ────────────────────────────────────────────────
const TILE_COLORS = [
  ["#e0f2fe", "#0ea5e9"],
  ["#fef9c3", "#ca8a04"],
  ["#fce7f3", "#db2777"],
  ["#dcfce7", "#16a34a"],
  ["#ede9fe", "#7c3aed"],
  ["#fff7ed", "#ea580c"],
  ["#f0fdf4", "#15803d"],
  ["#fef2f2", "#dc2626"],
];

function TileCell({ state, idx, onTap }) {
  const [bg, fg] = TILE_COLORS[idx % TILE_COLORS.length];
  return (
    <button
      onClick={() => onTap(idx)}
      className="relative aspect-square rounded-2xl border-2 transition-all duration-100 select-none focus:outline-none"
      style={{
        backgroundColor: state === "active" ? bg : state === "hit" ? "#bbf7d0" : "#f8fafc",
        borderColor: state === "active" ? fg : state === "hit" ? "#4ade80" : "#e2e8f0",
        transform: state === "active" ? "scale(1.08)" : state === "hit" ? "scale(0.9)" : "scale(1)",
        cursor: state === "active" ? "pointer" : "default",
        boxShadow: state === "active" ? `0 4px 16px ${fg}55` : "none",
      }}
    >
      {state === "active" && (
        <span
          className="absolute inset-0 flex items-center justify-center text-3xl sm:text-4xl font-black animate-bounce"
          style={{ color: fg }}
        >
          ₹
        </span>
      )}
      {state === "hit" && (
        <span className="absolute inset-0 flex items-center justify-center text-xl font-black text-emerald-500">
          +1
        </span>
      )}
    </button>
  );
}

function MiniGame() {
  const { phase, score, timeLeft, tiles, start, tap } = useGame();

  const timerPct = (timeLeft / GAME_DURATION) * 100;
  const timerColor =
    timeLeft > 15 ? "#22c55e" : timeLeft > 8 ? "#f59e0b" : "#ef4444";

  return (
    <div className="w-full max-w-xs sm:max-w-sm mx-auto select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">🎮</span>
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Tap the ₹</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold text-gray-500">
            Score <span className="text-blue-600 text-[13px]">{score}</span>
          </span>
          {phase === "playing" && (
            <span
              className="text-[11px] font-bold tabular-nums transition-colors"
              style={{ color: timerColor }}
            >
              {timeLeft}s
            </span>
          )}
        </div>
      </div>

      {/* Timer bar */}
      {phase === "playing" && (
        <div className="h-1.5 rounded-full bg-gray-100 mb-3 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${timerPct}%`, backgroundColor: timerColor }}
          />
        </div>
      )}

      {/* Grid */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {tiles.map((state, i) => (
          <TileCell key={i} state={state} idx={i} onTap={tap} />
        ))}
      </div>

      {/* Overlay for idle / game over */}
      {phase !== "playing" && (
        <div className="mt-4 flex flex-col items-center gap-3">
          {phase === "over" && (
            <div className="text-center">
              <p className="text-[13px] font-bold text-gray-500">
                {score >= 20
                  ? "Amazing! 🏆"
                  : score >= 10
                  ? "Nice work! 🎉"
                  : "Good try! 🙌"}
              </p>
              <p className="text-2xl font-black text-blue-700 mt-0.5">{score} pts</p>
            </div>
          )}
          {phase === "idle" && (
            <p className="text-[12px] text-gray-400 font-medium">
              Tap every ₹ before it vanishes!
            </p>
          )}
          <button
            onClick={start}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-[13px] font-bold shadow-md shadow-blue-200 transition-all"
          >
            {phase === "over" ? "Play Again" : "Start Game"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center px-4 py-10">

      {/* 404 Hero */}
      <div className="text-center mb-6">
        <p className="text-[90px] sm:text-[120px] font-black text-blue-100 leading-none select-none">
          404
        </p>
        <h1 className="text-xl sm:text-2xl font-black text-gray-800 -mt-4">
          Webpage Not Available
        </h1>
        <p className="mt-1.5 text-[13px] text-gray-400 max-w-xs mx-auto">
          The page you're looking for doesn't exist on this server.
          <br />
          While you're here, try the game below!
        </p>
      </div>

      {/* Game card */}
      <div className="w-full max-w-xs sm:max-w-sm bg-white rounded-3xl border border-blue-100 shadow-xl shadow-blue-50 p-5 mb-7">
        <MiniGame />
      </div>

      {/* CTA */}
      <a
        href="https://haappiibilling.in/"
        className="flex items-center gap-2.5 px-8 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-[14px] font-bold shadow-lg shadow-blue-200 transition-all"
      >
        <span className="text-lg">🏠</span>
        Go to Haappii Billing
      </a>

      <p className="mt-4 text-[11px] text-gray-300">
        haappiibilling.in
      </p>
    </div>
  );
}
