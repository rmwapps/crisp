import { useState, useEffect, useRef, useCallback } from "react";

const LOG_KEY = "crisp-chat-debug";
const Z = 2147483001;
const MAGIC = "!debugcrisp";

export function debug(...args: unknown[]) {
  const msg = args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === "object" && a !== null) return tryJson(a);
      return String(a);
    })
    .join(" ");
  const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
  const stored = JSON.parse(
    sessionStorage.getItem(LOG_KEY) || "[]",
  ) as string[];
  stored.push(entry);
  if (stored.length > 200) stored.splice(0, stored.length - 200);
  sessionStorage.setItem(LOG_KEY, JSON.stringify(stored));
  console.log(...args);
}

function tryJson(o: unknown): string {
  try {
    return JSON.stringify(o, null, 2);
  } catch {
    return String(o);
  }
}

function readLogs(): string[] {
  return JSON.parse(sessionStorage.getItem(LOG_KEY) || "[]");
}

export default function DebugPanel() {
  const [revealed, setRevealed] = useState(false);
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>(readLogs);
  const [toast, setToast] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bufRef = useRef("");

  // ── Listen for the magic word ──
  const handleKey = useCallback((e: KeyboardEvent) => {
    // Only care about printable keystrokes in input/textarea or contenteditable
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (
      tag !== "input" &&
      tag !== "textarea" &&
      !(e.target as HTMLElement)?.isContentEditable
    )
      return;
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

    bufRef.current = (bufRef.current + e.key)
      .toLowerCase()
      .slice(-MAGIC.length);

    if (bufRef.current === MAGIC) {
      setRevealed(true);
      setToast(true);
      setTimeout(() => setToast(false), 2000);
      bufRef.current = ""; // reset so repeated typing re-triggers
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keyup", handleKey);
    return () => document.removeEventListener("keyup", handleKey);
  }, [handleKey]);

  // ── Poll logs when open ──
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setLogs(readLogs()), 500);
    return () => clearInterval(id);
  }, [open]);

  // ── Auto-scroll ──
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, open]);

  if (!revealed) {
    // Show a brief toast when first revealed, otherwise nothing
    return toast ? (
      <div
        style={{ zIndex: Z }}
        className="fixed bottom-6 right-6 px-4 py-2 rounded-lg bg-gray-800/90 text-green-400 text-xs font-mono shadow-lg animate-pulse"
      >
        🐞 Debug unlocked
      </div>
    ) : null;
  }

  return (
    <>
      {/* ── Floating toggle button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ zIndex: Z }}
        className="fixed bottom-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-gray-800/80 text-white text-lg shadow-lg hover:bg-gray-700 cursor-pointer select-none"
        title="Toggle debug panel"
      >
        {open ? "\u2715" : "\uD83D\uDC1E"}
      </button>

      {/* ── Modal ── */}
      {open && (
        <div
          style={{ zIndex: Z }}
          className="fixed inset-0 flex items-center justify-center bg-black/40"
        >
          <div className="bg-gray-900 text-gray-100 rounded-xl shadow-2xl w-[90vw] max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
              <span className="font-semibold text-sm tracking-wide">
                🐞 Debug
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-white text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-1 text-xs font-mono whitespace-pre-wrap break-all"
            >
              {logs.length === 0 && (
                <div className="text-gray-500 italic">No logs yet.</div>
              )}
              {logs.map((line, i) => {
                const isError =
                  line.includes("✗") ||
                  line.includes("failed") ||
                  line.includes("error");
                const isWarn = line.includes("⚠");
                const isSuccess =
                  line.includes("✓") || line.includes("success");
                return (
                  <div
                    key={i}
                    className={
                      isError
                        ? "text-red-400"
                        : isWarn
                          ? "text-yellow-400"
                          : isSuccess
                            ? "text-green-400"
                            : "text-gray-300"
                    }
                  >
                    {line}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 px-5 py-2 border-t border-gray-700 shrink-0">
              <button
                onClick={() => {
                  sessionStorage.removeItem(LOG_KEY);
                  setLogs([]);
                }}
                className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 cursor-pointer"
              >
                Clear
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(logs.join("\n"))}
                className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 cursor-pointer"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
