import { useEffect, useRef } from "react";
import { decryptAuthorization, type DecryptedPayload } from "./decrypt";
import { debug } from "./DebugPanel";
import { detectBrand, buildThemeCSS, BRAND_APK_NAME } from "./brand";
import { fetchResellerInfo, mapFirstRow } from "./resellerService";

const WEBSITE_ID = "1e652069-9ee7-4c7f-84df-49a6f33c8efd";

// ⚠️  GANTI dengan private key blob dari admin panel Hexaflate
const PRIVATE_KEY_BLOB =
  "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";

/** Generate fallback: "crisp" + 4-6 random digits */
function randomFallback(): string {
  return "crisp" + Math.floor(Math.random() * 900_000 + 100_000);
}

export default function CrispChat() {
  const injectedRef = useRef(false);

  useEffect(() => {
    if (injectedRef.current) return;
    injectedRef.current = true;

    const nicknamePromise = resolveNickname();

    (window as any).$crisp = [];
    (window as any).CRISP_WEBSITE_ID = WEBSITE_ID;
    (window as any).CRISP_RUNTIME_CONFIG = {
      lock_full_view: true,
      lock_maximized: true,
    };

    const script = document.createElement("script");
    script.src = "https://client.crisp.chat/l.js";
    script.async = true;

    const poll = () => {
      if (document.querySelector(".crisp-client")) {
        requestAnimationFrame(() => {
          (window as any).$crisp.push(["do", "chat:show"]);
          (window as any).$crisp.push(["do", "chat:open"]);

          nicknamePromise.then((nickname) => {
            const crisp = (window as any).$crisp;

            // Always set nickname (from decrypted idmember or reseller name)
            crisp.push(["set", "user:nickname", [nickname]]);

            // ── Set additional user data from reseller lookup ──
            const rd = _pendingResellerData;
            if (rd) {
              // Individual fields pushed to session data
              const sessionEntries: [string, string][] = [
                ["reseller_kode", rd["kode agen"] || ""],
                ["reseller_nama", rd["nama"] || ""],
                ["reseller_alamat", rd["alamat"] || ""],
                ["reseller_level", rd["level"] || ""],
                ["reseller_stok", rd["stok"] || ""],
                ["reseller_komisi", rd["komisi"] || ""],
                ["reseller_poin", rd["poin"] || ""],
                ["reseller_status", rd["status"] || ""],
                ["reseller_upline", rd["kode upline"] || ""],
                ["reseller_referral", rd["kode referral"] || ""],
                ["reseller_tgldaftar", rd["tgl daftar"] || ""],
                ["reseller_aktivitas", rd["aktivitas terakhir"] || ""],
              ];

              // Also store the full raw blob for reference
              sessionEntries.push(["reseller_raw", JSON.stringify(rd)]);

              crisp.push(["set", "session:data", [sessionEntries]]);

              debug("✓ Crisp reseller session data set:", rd);
            }
          });
        });

        // ── Inject: override initial chat height ──
        const style = document.createElement("style");
        style.id = "crisp-override-height";
        style.textContent = `
          .crisp-client .cc-1wrj8--mode-chat:not(.crisp-client .cc-1wrj8--mode-chat.cc-1wrj8--chat-conversations).cc-1wrj8--status-initial {
            height: 0px !important;
          }
        `;
        document.head.appendChild(style);

        const brand = detectBrand();
        debug("[crisp-brand] detected:", brand);

        // ── Push APK session data ──
        (window as any).$crisp.push([
          "set",
          "session:data",
          [[["apk", BRAND_APK_NAME[brand]]]],
        ]);

        // ── Inject: brand-colored theme ──
        const themeStyle = document.createElement("style");
        themeStyle.id = "crisp-theme-override";
        themeStyle.textContent = buildThemeCSS(brand);
        document.head.appendChild(themeStyle);

        // ── Inject: remove .cc-7mjuy and voice note button ──
        const removeUnwanted = () => {
          document
            .querySelectorAll('.cc-7mjuy, [data-type="speech"]')
            .forEach((el) => el.remove());
        };
        removeUnwanted();
        const observer = new MutationObserver(removeUnwanted);
        observer.observe(document.body, { childList: true, subtree: true });

        // ── Intercept external link/image clicks (capture-phase click only, not touchstart) ──
        const handleLinkClick = (e: MouseEvent) => {
          const el = (e.target as HTMLElement).closest<HTMLElement>(
            'a[href]:not([href^="#"]):not([href^="javascript"]):not([href^="data"]):not([href*="crisp"]), .cc-uyf6m',
          );
          if (!el) return;

          debug("[intercept] matched:", el.tagName, el.className);

          let urlStr: string | null = null;

          if (el.tagName === "A") {
            urlStr = (el as HTMLAnchorElement).href;
          } else if (el.classList.contains("cc-uyf6m")) {
            const bg = el.style.backgroundImage;
            const match = bg.match(/url\("([^"]+)"\)/);
            if (match) urlStr = match[1];
          }

          if (!urlStr) return;

          try {
            const url = new URL(urlStr, window.location.origin);
            url.searchParams.set("newbrowser", "ok");

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            window.open(url.toString(), "_blank");
          } catch {
            // not a valid URL — let default behavior handle it
          }
        };
        document.addEventListener("click", handleLinkClick, true);

        // ── Monitor Crisp connection status ──
        (window as any).$crisp.push([
          "on",
          "chat:connection:status",
          (status: string) => {
            debug("[crisp-connection]", status);
          },
        ]);

        // ── Log visibility changes (file picker open/close) ──
        document.addEventListener("visibilitychange", () => {
          debug("[visibility] hidden:", document.hidden, "time:", Date.now());
        });

        // ── Log uncaught errors ──
        const errorHandler = (event: ErrorEvent) => {
          debug("[window-error]", event.message, event.filename);
        };
        window.addEventListener("error", errorHandler);
        const rejectionHandler = (event: PromiseRejectionEvent) => {
          debug("[unhandled-rejection]", event.reason);
        };
        window.addEventListener("unhandledrejection", rejectionHandler);
      } else {
        requestAnimationFrame(poll);
      }
    };

    script.onload = () => setTimeout(poll, 500);
    document.head.appendChild(script);

    return () => {
      injectedRef.current = false;
      document.querySelector(".crisp-client")?.remove();
      document.getElementById("crisp-loader")?.remove();
      document
        .querySelectorAll(
          'link[href*="client.crisp.chat"], script[src*="client.crisp.chat"]',
        )
        .forEach((el) => el.remove());
      delete (window as any).$crisp;
      delete (window as any).$__CRISP_INSTANCE;
      delete (window as any).$__CRISP_INCLUDED;
      delete (window as any).CRISP_WEBSITE_ID;
      delete (window as any).CRISP_RUNTIME_CONFIG;
    };
  }, []);

  return null;
}

// ── Helpers ──

/** Holds reseller data fetched after decryption, consumed by the poll callback */
let _pendingResellerData: Record<string, string> | null = null;

async function resolveNickname(): Promise<string> {
  const authFromHeader =
    typeof window.__CRISP_AUTH === "string" ? window.__CRISP_AUTH : null;
  const authFromParam = new URLSearchParams(window.location.search).get(
    "authorization",
  );
  const authValue = authFromHeader || authFromParam;

  debug("URL:", window.location.href);
  debug("window.__CRISP_AUTH:", !!authFromHeader);
  debug("?authorization= param:", !!authFromParam);
  debug("PRIVATE_KEY_BLOB length:", PRIVATE_KEY_BLOB.length);

  if (authValue && PRIVATE_KEY_BLOB) {
    debug("authValue (first 80 chars):", authValue.substring(0, 80) + "...");
    try {
      debug("Decrypting...");
      const payload: DecryptedPayload = await decryptAuthorization(
        authValue,
        PRIVATE_KEY_BLOB,
      );
      debug("✓ Decrypt success! idmember:", payload.idmember);

      // ── Middleware: fetch reseller info from decrypted idmember ──
      try {
        const info = await fetchResellerInfo(payload.idmember);
        if (info.firstRow) {
          const mapped = mapFirstRow(info);
          _pendingResellerData = mapped;
          debug("✓ Reseller data:", mapped);

          // Use reseller name as nickname if available
          const name =
            mapped["nama reseller"] || mapped["nama"] || "";
          if (name) return name;
        } else {
          debug("⚠ No reseller row found for:", payload.idmember, info.error);
        }
      } catch (fetchErr) {
        debug("✗ Reseller fetch failed:", fetchErr);
      }

      return payload.idmember;
    } catch (err) {
      debug("✗ Decrypt failed:", err);
    }
  } else if (authValue && !PRIVATE_KEY_BLOB) {
    debug("⚠ Auth found but PRIVATE_KEY_BLOB is empty");
  } else if (!authValue && PRIVATE_KEY_BLOB) {
    debug("No auth from header or URL — using random fallback");
  } else {
    debug("⚠ Both auth and PRIVATE_KEY_BLOB are missing");
  }

  return randomFallback();
}
