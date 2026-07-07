import { useEffect, useState } from "react";
import CrispChat from "./CrispChat";

export default function App() {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    // Watch for Crisp's chatbox to appear
    const observer = new MutationObserver(() => {
      if (document.querySelector("#crisp-chatbox")) {
        setReady(true);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Timeout fallback
    const timer = setTimeout(() => {
      if (!document.querySelector("#crisp-chatbox")) {
        setTimedOut(true);
      }
      observer.disconnect();
    }, 15_000);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="w-screen h-dvh relative overflow-hidden bg-white select-none">
      {/* ── Loading state ── */}
      {!ready && !timedOut && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-0 text-gray-400">
          <svg
            className="w-12 h-12 animate-pulse"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
            />
          </svg>
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-medium text-gray-500">
              Loading chat...
            </span>
            <span className="text-xs text-gray-400">Connecting to Crisp</span>
          </div>
        </div>
      )}

      {/* ── Timeout fallback ── */}
      {timedOut && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-0 text-gray-400">
          <svg
            className="w-16 h-16 text-gray-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
          <span className="text-sm text-gray-500">
            Could not load the chat widget.
          </span>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Crisp widget (hidden until ready) ── */}
      <div className={ready ? "absolute inset-0 z-10" : "hidden"}>
        <CrispChat />
      </div>
    </div>
  );
}
