import { useState, useEffect, useRef, useCallback } from "react";
import { Bug, X, Network, Server, Code2 } from "lucide-react";

// ── Logging ──────────────────────────────────────────────────────────
const LOG_KEY = "crisp-chat-debug";
const Z = 2147483001;

/** How long (ms) to hold the send button before debug unlocks */
const REVEAL_HOLD_MS = 5000;

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

// ── Network interceptor ──────────────────────────────────────────────
interface NetEntry {
  id: number;
  method: string;
  url: string;
  status: number | "pending" | "error";
  timing: number;
  body?: string;
  responseBody?: string;
  contentType?: string;
  timestamp: number;
}

let netEntries: NetEntry[] = [];
let netId = 0;
const NET_MAX = 100;
let onNetUpdate: (() => void) | null = null;

function notifyNet() {
  if (onNetUpdate) onNetUpdate();
}

function initNetworkCapture() {
  // Intercept fetch
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : (input as URL).href;
    const method = (
      init?.method || (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const id = ++netId;
    const entry: NetEntry = {
      id,
      method,
      url,
      status: "pending",
      timing: 0,
      timestamp: Date.now(),
    };
    netEntries.push(entry);
    if (netEntries.length > NET_MAX) netEntries = netEntries.slice(-NET_MAX);
    notifyNet();
    const start = performance.now();
    try {
      const res = await origFetch(input, init);
      entry.status = res.status;
      entry.timing = Math.round(performance.now() - start);
      entry.contentType = res.headers.get("content-type") || undefined;
      // Clone response to read body
      try {
        const ct = entry.contentType || "";
        if (ct.includes("json")) {
          const clone = res.clone();
          entry.responseBody = tryJson(await clone.json());
        } else if (ct.includes("text") || ct.includes("html")) {
          const clone = res.clone();
          entry.responseBody = (await clone.text()).slice(0, 2000);
        }
      } catch {
        /* ignore */
      }
      notifyNet();
      return res;
    } catch (err) {
      entry.status = "error";
      entry.timing = Math.round(performance.now() - start);
      entry.responseBody = String(err);
      notifyNet();
      throw err;
    }
  };

  // Intercept XHR
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const xhrMap = new WeakMap<XMLHttpRequest, NetEntry>();

  XMLHttpRequest.prototype.open = function (method, url) {
    const id = ++netId;
    const urlStr = typeof url === "string" ? url : String(url);
    const entry: NetEntry = {
      id,
      method: method.toUpperCase(),
      url: urlStr,
      status: "pending",
      timing: 0,
      timestamp: Date.now(),
    };
    netEntries.push(entry);
    if (netEntries.length > NET_MAX) netEntries = netEntries.slice(-NET_MAX);
    xhrMap.set(this, entry);
    notifyNet();
    return origOpen.apply(this, arguments as any);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const entry = xhrMap.get(this);
    if (entry) entry.body = body ? String(body).slice(0, 500) : undefined;
    const start = performance.now();
    this.addEventListener("loadend", () => {
      if (!entry) return;
      entry.timing = Math.round(performance.now() - start);
      entry.status = this.status;
      entry.contentType = this.getResponseHeader("content-type") || undefined;
      try {
        const ct = entry.contentType || "";
        if (ct.includes("json"))
          entry.responseBody = tryJson(JSON.parse(this.responseText));
        else if (ct.includes("text") || ct.includes("html"))
          entry.responseBody = this.responseText.slice(0, 2000);
      } catch {
        /* ignore */
      }
      notifyNet();
    });
    this.addEventListener("error", () => {
      if (!entry) return;
      entry.status = "error";
      entry.timing = Math.round(performance.now() - start);
      notifyNet();
    });
    return origSend.apply(this, arguments as any);
  };
}

// ── DOM Inspector helpers ────────────────────────────────────────────
function getElementInfo(el: Element) {
  const rect = el.getBoundingClientRect();
  const computed = getComputedStyle(el);
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    classes: Array.from(el.classList),
    attributes: Array.from(el.attributes).map((a) => ({
      name: a.name,
      value: a.value,
    })),
    rect: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
    innerText: (el.textContent || "").trim().slice(0, 200),
    outerHTML: el.outerHTML.slice(0, 3000),
    computedProps: {
      display: computed.display,
      position: computed.position,
      zIndex: computed.zIndex,
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      font: computed.font,
    },
  };
}

// ── Tab config ───────────────────────────────────────────────────────
type TabId = "console" | "elements" | "network" | "storage";

const TABS: { id: TabId; label: string; icon: typeof Bug }[] = [
  { id: "console", label: "Console", icon: Bug },
  { id: "elements", label: "Elements", icon: Code2 },
  { id: "network", label: "Network", icon: Network },
  { id: "storage", label: "Storage", icon: Server },
];

// ── Component ────────────────────────────────────────────────────────
export default function DebugPanel() {
  const [revealed, setRevealed] = useState(import.meta.env.DEV);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("console");
  const [logs, setLogs] = useState<string[]>(readLogs);
  const [toast, setToast] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Network state ──
  const [netList, setNetList] = useState<NetEntry[]>([]);
  const [selectedNet, setSelectedNet] = useState<NetEntry | null>(null);

  // ── Elements state ──
  const [inspectMode, setInspectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<Element | null>(null);
  const [elementInfo, setElementInfo] = useState<ReturnType<
    typeof getElementInfo
  > | null>(null);
  const [hoveredElement, setHoveredElement] = useState<Element | null>(null);
  const [copyToast, setCopyToast] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const [findResults, setFindResults] = useState<Element[]>([]);
  const [findHighlightEl, setFindHighlight] = useState<Element | null>(null);
  const doFind = useCallback((selector: string) => {
    if (!selector.trim()) {
      setFindResults([]);
      setFindHighlight(null);
      return;
    }
    try {
      const results = Array.from(document.querySelectorAll(selector.trim()));
      setFindResults(results);
      setFindHighlight(null);
      if (results.length > 0) {
        setSelectedElement(results[0]);
        setElementInfo(getElementInfo(results[0]));
        setFindHighlight(results[0]);
      }
    } catch {
      setFindResults([]);
    }
  }, []);

  // ── Storage state ──
  const [storageView, setStorageView] = useState<"local" | "session">("local");
  const refreshStorage = useRef(0);

  // ── Long-press unlock: hold Crisp send button for 5s ──
  const clearHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>(".cc-1qqgc");
      if (!btn) return;
      holdTimerRef.current = setTimeout(() => {
        setRevealed(true);
        setToast(true);
        setTimeout(() => setToast(false), 2000);
        holdTimerRef.current = null;
      }, REVEAL_HOLD_MS);
    },
    [clearHold],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".cc-1qqgc")) return;
      clearHold();
    },
    [clearHold],
  );

  useEffect(() => {
    // Use capture phase so we see the event before Crisp's own handlers
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", clearHold, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", clearHold, true);
    };
  }, [handlePointerDown, handlePointerUp, clearHold]);

  // ── Console polling ──
  useEffect(() => {
    if (!open || tab !== "console") return;
    const id = setInterval(() => setLogs(readLogs()), 500);
    return () => clearInterval(id);
  }, [open, tab]);

  // Auto-scroll console
  useEffect(() => {
    if (open && tab === "console" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, open, tab]);

  // ── Escape key closes panel ──
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // ── Init network capture ──
  useEffect(() => {
    initNetworkCapture();
    onNetUpdate = () => {
      setNetList([...netEntries]);
    };
  }, []);

  // ── Elements mode: overlay highlight ──
  useEffect(() => {
    if (!inspectMode) {
      setHoveredElement(null);
      return;
    }
    const handleMouseMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el !== document.documentElement && el !== document.body) {
        setHoveredElement(el);
      }
    };
    const handleClick = (e: MouseEvent) => {
      if (!inspectMode) return;
      e.preventDefault();
      e.stopPropagation();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el !== document.documentElement && el !== document.body) {
        setSelectedElement(el);
        setElementInfo(getElementInfo(el));
        setInspectMode(false);
        setHoveredElement(null);
        setOpen(true); // reopen modal with results
        setTab("elements");
      }
    };
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, [inspectMode]);

  // ── Tab switch: reset sub-states ──
  const switchTab = useCallback((t: TabId) => {
    setTab(t);
    setSelectedNet(null);
    setSelectedElement(null);
    setElementInfo(null);
    setInspectMode(false);
    setHoveredElement(null);
    setFindResults([]);
    setFindHighlight(null);
  }, []);

  if (!revealed) {
    return toast ? (
      <div
        style={{ zIndex: Z }}
        className="fixed top-4 left-4 px-4 py-2 rounded-lg bg-gray-800/90 text-green-400 text-xs font-mono shadow-lg animate-pulse"
      >
        Debug unlocked
      </div>
    ) : null;
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => {
          const willOpen = !open;
          setOpen(willOpen);
          if (willOpen && inspectMode) {
            // Cancelling inspect mode when opening modal via toggle
            setInspectMode(false);
            setSelectedElement(null);
            setElementInfo(null);
            setHoveredElement(null);
          }
          if (willOpen && !inspectMode) switchTab("console");
        }}
        style={{ zIndex: Z + 1 }}
        className="fixed top-4 left-4 w-10 h-10 flex items-center justify-center rounded-full bg-gray-800/80 text-white shadow-lg hover:bg-gray-700 cursor-pointer select-none"
        title="Toggle inspector"
      >
        {open ? <X size={20} /> : <Bug size={20} />}
      </button>

      {/* Hover overlay when in inspect mode */}
      {inspectMode && hoveredElement && (
        <div
          ref={overlayRef}
          style={{
            zIndex: Z - 1,
            position: "fixed",
            pointerEvents: "none",
            border: "2px solid #3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            top: hoveredElement.getBoundingClientRect().top + "px",
            left: hoveredElement.getBoundingClientRect().left + "px",
            width: hoveredElement.getBoundingClientRect().width + "px",
            height: hoveredElement.getBoundingClientRect().height + "px",
          }}
        />
      )}
      {inspectMode && (
        <div
          style={{ zIndex: Z - 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-mono shadow-lg"
        >
          Click any element to inspect
        </div>
      )}

      {/* Main panel */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ zIndex: Z }}
          className="fixed inset-0 flex items-center justify-center bg-black/40"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-900 text-gray-100 rounded-xl shadow-2xl w-[95vw] max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
          >
            {/* ── Header with tabs ── */}
            <div className="flex items-center border-b border-gray-700 shrink-0">
              <div className="flex overflow-x-auto whitespace-nowrap min-w-0">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => switchTab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                      tab === t.id
                        ? "text-blue-400 border-b-2 border-blue-400 bg-gray-800/50"
                        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/30"
                    }`}
                  >
                    <t.icon size={14} />
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="mr-3 text-gray-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* ── Tab content ── */}
            <div className="flex-1 overflow-hidden flex">
              {/* Console */}
              {tab === "console" && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-4 space-y-1 text-xs font-mono whitespace-pre-wrap break-all"
                  >
                    {logs.length === 0 && (
                      <div className="text-gray-500 italic">No logs yet.</div>
                    )}
                    {logs.map((line, i) => {
                      const isError =
                        line.includes("\u2717") ||
                        line.includes("failed") ||
                        line.includes("error");
                      const isWarn = line.includes("\u26A0");
                      const isSuccess =
                        line.includes("\u2713") || line.includes("success");
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
                      onClick={() =>
                        navigator.clipboard.writeText(logs.join("\n"))
                      }
                      className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 cursor-pointer"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {/* Elements */}
              {tab === "elements" && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Toolbar */}
                  <div className="flex flex-col shrink-0">
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-700">
                      <button
                        onClick={() => {
                          if (inspectMode) {
                            // Cancel inspect — reopen modal
                            setOpen(true);
                            setInspectMode(false);
                          } else {
                            // Start inspect — close modal
                            setOpen(false);
                            setInspectMode(true);
                            setTab("elements");
                          }
                          setSelectedElement(null);
                          setElementInfo(null);
                        }}
                        className={`text-xs px-3 py-1.5 rounded cursor-pointer shrink-0 ${
                          inspectMode
                            ? "bg-blue-600 text-white"
                            : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                        }`}
                      >
                        {inspectMode ? "Cancel inspect" : "Pick element"}
                      </button>
                      {selectedElement && (
                        <>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(
                                getElementInfo(selectedElement).outerHTML,
                              );
                              setCopyToast(true);
                              setTimeout(() => setCopyToast(false), 1500);
                            }}
                            className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer shrink-0"
                          >
                            Copy HTML
                          </button>
                          <button
                            onClick={() => {
                              // Re-inspect same element in case styles changed
                              setElementInfo(getElementInfo(selectedElement));
                            }}
                            className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer shrink-0"
                          >
                            Refresh
                          </button>
                        </>
                      )}
                    </div>
                    {/* Find bar */}
                    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-700 bg-gray-850">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider shrink-0">
                        Find
                      </span>
                      <input
                        ref={findInputRef}
                        type="text"
                        placeholder="CSS selector, e.g. [aria-label*='voice']"
                        className="flex-1 bg-gray-800 text-gray-200 text-xs px-2 py-1 rounded border border-gray-700 outline-none focus:border-blue-500 placeholder:text-gray-600"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            doFind(e.currentTarget.value);
                          }
                        }}
                      />
                      <button
                        onClick={() =>
                          findInputRef.current &&
                          doFind(findInputRef.current.value)
                        }
                        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 cursor-pointer shrink-0"
                      >
                        Search
                      </button>
                      {findResults.length > 0 && (
                        <span className="text-[10px] text-gray-500 shrink-0">
                          {findResults.length} match
                          {findResults.length > 1 ? "es" : ""}
                        </span>
                      )}
                    </div>
                    {/* Find results list */}
                    {findResults.length > 0 && (
                      <div className="max-h-24 overflow-y-auto border-b border-gray-700 bg-gray-850/50">
                        {findResults.map((el, i) => (
                          <div
                            key={i}
                            onClick={() => {
                              setSelectedElement(el);
                              setElementInfo(getElementInfo(el));
                              setFindHighlight(el);
                            }}
                            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-mono cursor-pointer hover:bg-gray-700/50 ${
                              selectedElement === el ? "bg-gray-700" : ""
                            }`}
                          >
                            <span className="text-blue-400 shrink-0">
                              &lt;{el.tagName.toLowerCase()}
                            </span>
                            {el.className && (
                              <span className="text-green-400 truncate">
                                .{el.className.split(/\s+/).join(".")}
                              </span>
                            )}
                            {el.getAttribute("aria-label") && (
                              <span className="text-orange-300 truncate">
                                "{el.getAttribute("aria-label")}"
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Find highlight overlay */}
                    {findHighlightEl && (
                      <div
                        style={{
                          position: "fixed",
                          zIndex: Z - 1,
                          pointerEvents: "none",
                          border: "2px solid #f59e0b",
                          backgroundColor: "rgba(245, 158, 11, 0.15)",
                          top:
                            findHighlightEl.getBoundingClientRect().top + "px",
                          left:
                            findHighlightEl.getBoundingClientRect().left + "px",
                          width:
                            findHighlightEl.getBoundingClientRect().width +
                            "px",
                          height:
                            findHighlightEl.getBoundingClientRect().height +
                            "px",
                          transition: "all 0.15s ease",
                        }}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 overflow-y-auto p-4 text-xs font-mono">
                    {!selectedElement && !inspectMode && (
                      <div className="text-gray-500 italic">
                        Click{" "}
                        <strong className="text-blue-400">Pick element</strong>{" "}
                        then click on any element in the page to inspect it.
                      </div>
                    )}
                    {inspectMode && (
                      <div className="text-blue-400">
                        Move cursor over elements and click to inspect...
                      </div>
                    )}
                    {elementInfo && (
                      <div className="space-y-3 relative">
                        {copyToast && (
                          <div className="absolute -top-2 right-0 px-2 py-0.5 rounded bg-green-600 text-white text-[10px] animate-pulse">
                            Copied!
                          </div>
                        )}
                        {/* Tag + ID + classes */}
                        <div>
                          <span className="text-blue-400">
                            &lt;{elementInfo.tag}
                          </span>
                          {elementInfo.id && (
                            <span className="text-yellow-400">
                              {" "}
                              #{elementInfo.id}
                            </span>
                          )}
                          {elementInfo.classes.length > 0 && (
                            <span className="text-green-400">
                              {" "}
                              .{elementInfo.classes.join(".")}
                            </span>
                          )}
                          <span className="text-blue-400">&gt;</span>
                        </div>

                        {/* Attributes */}
                        {elementInfo.attributes.length > 0 && (
                          <div>
                            <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">
                              Attributes
                            </div>
                            {elementInfo.attributes.map((a, i) => (
                              <div key={i} className="text-gray-300">
                                <span className="text-purple-400">
                                  {a.name}
                                </span>
                                {a.value && (
                                  <>
                                    <span className="text-gray-500">="</span>
                                    <span className="text-orange-300">
                                      {a.value}
                                    </span>
                                    <span className="text-gray-500">"</span>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Computed style */}
                        <div>
                          <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">
                            Computed styles
                          </div>
                          {(
                            Object.entries(elementInfo.computedProps) as [
                              string,
                              string,
                            ][]
                          ).map(([key, val]) => (
                            <div key={key} className="text-gray-300">
                              <span className="text-purple-400">{key}</span>
                              <span className="text-gray-500">: </span>
                              <span className="text-gray-100">{val}</span>
                            </div>
                          ))}
                        </div>

                        {/* Dimensions */}
                        <div>
                          <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">
                            Dimensions
                          </div>
                          <div className="text-gray-300">
                            {elementInfo.rect.width.toFixed(0)} &times;{" "}
                            {elementInfo.rect.height.toFixed(0)} px &mdash; top:{" "}
                            {elementInfo.rect.top.toFixed(0)}, left:{" "}
                            {elementInfo.rect.left.toFixed(0)}
                          </div>
                        </div>

                        {/* Text content */}
                        {elementInfo.innerText && (
                          <div>
                            <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">
                              Text content
                            </div>
                            <div className="text-gray-300 bg-gray-800 rounded p-2 whitespace-pre-wrap max-h-24 overflow-y-auto">
                              {elementInfo.innerText}
                            </div>
                          </div>
                        )}

                        {/* HTML */}
                        <div>
                          <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">
                            Outer HTML (truncated)
                          </div>
                          <div className="text-gray-300 bg-gray-800 rounded p-2 whitespace-pre-wrap max-h-48 overflow-y-auto">
                            {elementInfo.outerHTML}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Network */}
              {tab === "network" && (
                <div className="flex-1 flex overflow-hidden">
                  {/* List */}
                  <div className="w-1/2 border-r border-gray-700 flex flex-col overflow-hidden">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider px-3 py-1.5 border-b border-gray-700 shrink-0">
                      Requests
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {netList.length === 0 && (
                        <div className="text-gray-500 italic text-xs p-4">
                          No requests captured yet.
                        </div>
                      )}
                      {[...netList].reverse().map((entry) => (
                        <div
                          key={entry.id}
                          onClick={() => setSelectedNet(entry)}
                          className={`flex items-center gap-2 px-3 py-2 text-xs font-mono border-b border-gray-800 cursor-pointer hover:bg-gray-800 ${
                            selectedNet?.id === entry.id ? "bg-gray-700" : ""
                          }`}
                        >
                          <span
                            className={`shrink-0 w-12 text-center px-1 py-0.5 rounded text-[10px] font-semibold ${
                              entry.status === "pending"
                                ? "bg-yellow-900/50 text-yellow-400"
                                : entry.status === "error"
                                  ? "bg-red-900/50 text-red-400"
                                  : entry.status >= 200 && entry.status < 300
                                    ? "bg-green-900/50 text-green-400"
                                    : "bg-red-900/50 text-red-400"
                            }`}
                          >
                            {entry.status === "pending"
                              ? "PEND"
                              : entry.status === "error"
                                ? "ERR"
                                : entry.status}
                          </span>
                          <span className="text-purple-400 shrink-0 w-12">
                            {entry.method}
                          </span>
                          <span className="text-gray-300 truncate min-w-0">
                            {entry.url.length > 80
                              ? entry.url.slice(0, 80) + "…"
                              : entry.url}
                          </span>
                          <span className="text-gray-500 shrink-0 ml-auto">
                            {entry.timing}ms
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Detail */}
                  <div className="w-1/2 flex flex-col overflow-hidden">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider px-3 py-1.5 border-b border-gray-700 shrink-0">
                      {selectedNet ? "Detail" : "Select a request"}
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 text-xs font-mono">
                      {!selectedNet && (
                        <div className="text-gray-500 italic">
                          Click a request to view details.
                        </div>
                      )}
                      {selectedNet && (
                        <div className="space-y-2">
                          <div>
                            <span className="text-gray-500">URL: </span>
                            <span className="text-blue-300 break-all">
                              {selectedNet.url}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Method: </span>
                            <span className="text-purple-400">
                              {selectedNet.method}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Status: </span>
                            <span
                              className={
                                selectedNet.status === "pending"
                                  ? "text-yellow-400"
                                  : selectedNet.status === "error"
                                    ? "text-red-400"
                                    : selectedNet.status >= 200 &&
                                        selectedNet.status < 300
                                      ? "text-green-400"
                                      : "text-red-400"
                              }
                            >
                              {String(selectedNet.status)}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Time: </span>
                            <span className="text-gray-200">
                              {selectedNet.timing}ms
                            </span>
                          </div>
                          {selectedNet.contentType && (
                            <div>
                              <span className="text-gray-500">
                                Content-Type:{" "}
                              </span>
                              <span className="text-gray-200">
                                {selectedNet.contentType}
                              </span>
                            </div>
                          )}
                          {selectedNet.body && (
                            <div>
                              <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">
                                Request body
                              </div>
                              <pre className="text-gray-300 bg-gray-800 rounded p-2 max-h-32 overflow-y-auto">
                                {selectedNet.body}
                              </pre>
                            </div>
                          )}
                          {selectedNet.responseBody && (
                            <div>
                              <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">
                                Response body
                              </div>
                              <pre className="text-gray-300 bg-gray-800 rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap">
                                {selectedNet.responseBody}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Storage */}
              {tab === "storage" && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-700 shrink-0">
                    <button
                      onClick={() => setStorageView("local")}
                      className={`text-xs px-3 py-1.5 rounded cursor-pointer ${
                        storageView === "local"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                      }`}
                    >
                      localStorage
                    </button>
                    <button
                      onClick={() => setStorageView("session")}
                      className={`text-xs px-3 py-1.5 rounded cursor-pointer ${
                        storageView === "session"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                      }`}
                    >
                      sessionStorage
                    </button>
                    <button
                      onClick={() => refreshStorage.current++}
                      className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 cursor-pointer"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 text-xs font-mono">
                    <StorageTable
                      storage={
                        storageView === "local" ? localStorage : sessionStorage
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Storage table sub-component ──────────────────────────────────────
function StorageTable({ storage }: { storage: Storage }) {
  const keys = Object.keys(storage);
  if (keys.length === 0) {
    return <div className="text-gray-500 italic">Empty.</div>;
  }
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-gray-500 text-[10px] uppercase tracking-wider border-b border-gray-700">
          <th className="text-left py-1 pr-2">Key</th>
          <th className="text-left py-1 pl-2">Value</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => {
          const raw = storage.getItem(key) || "";
          const display = raw.length > 200 ? raw.slice(0, 200) + "…" : raw;
          return (
            <tr
              key={key}
              className="border-b border-gray-800 hover:bg-gray-800/50"
            >
              <td className="py-1.5 pr-2 text-blue-400 align-top break-all max-w-50">
                {key}
              </td>
              <td className="py-1.5 pl-2 text-gray-300 break-all whitespace-pre-wrap max-w-100">
                {display}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
