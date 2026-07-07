import { useState, useEffect, useRef } from "react";

const LOG_KEY = "crisp-chat-debug";

/** Collect debug messages – accessible from anywhere without React. */
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

  // Also native console
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
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>(readLogs);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Poll for new logs every 500ms
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      setLogs(readLogs());
    }, 500);
    return () => clearInterval(id);
  }, [open]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, open]);

  return (
    <>
      {/* ── Floating toggle button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-[9999] w-10 h-10 flex items-center justify-center rounded-full bg-gray-800/80 text-white text-lg shadow-lg hover:bg-gray-700 cursor-pointer select-none"
        title="Toggle debug panel"
        aria-label="Toggle debug panel"
      >
        {open ? "✕" : "🐞"}
      </button>

      {/* ── Modal ── */}
      {open && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40">
          <div className="bg-gray-900 text-gray-100 rounded-xl shadow-2xl w-[90vw] max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
              <span className="font-semibold text-sm tracking-wide">
                🐞 Crisp Debug
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-white text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Logs */}
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
                const isWarn = line.includes("⚠") || line.includes("warn");
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

            {/* Footer actions */}
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
                onClick={() => {
                  navigator.clipboard.writeText(logs.join("\n"));
                }}
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
