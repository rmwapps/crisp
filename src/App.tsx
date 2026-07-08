import { useEffect, useState } from "react";
import CrispChat from "./CrispChat";
import DebugPanel from "./DebugPanel";
import { detectBrand, BRAND_PRIMARY_HEX, setFavicon } from "./brand";

export default function App() {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const brand = detectBrand();
  const brandColor = BRAND_PRIMARY_HEX[brand];
  setFavicon(brand);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector("#crisp-chatbox")) {
        setReady(true);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

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
          <div
            className="w-12 h-12 border-3 border-gray-200 rounded-full animate-spin"
            style={{ borderTopColor: brandColor }}
          />
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

      {/* ── Crisp widget ── */}
      <div className={ready ? "absolute inset-0 z-10" : "hidden"}>
        <CrispChat />
      </div>

      {/* ── Debug floating button + modal ── */}
      <DebugPanel />
    </div>
  );
}
