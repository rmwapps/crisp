import { useEffect, useRef } from "react";
import { decryptAuthorization, type DecryptedPayload } from "./decrypt";
import { debug } from "./DebugPanel";
import {
  detectBrand,
  buildThemeCSS,
  BRAND_APK_NAME,
  type BrandKey,
} from "./brand";

const WEBSITE_ID = "1e652069-9ee7-4c7f-84df-49a6f33c8efd";

/** Generate fallback: "crisp" + 4-6 random digits */
function randomFallback(): string {
  return "crisp" + Math.floor(Math.random() * 900_000 + 100_000);
}

export default function CrispChat() {
  const injectedRef = useRef(false);

  useEffect(() => {
    if (injectedRef.current) return;
    injectedRef.current = true;

    const runtimeConfig = getRuntimeConfig();
    const websiteId = runtimeConfig.websiteId;

    if (!websiteId) {
      debug("✗ Missing Crisp website ID for brand:", runtimeConfig.brand);
      return;
    }

    const nicknamePromise = resolveNickname(runtimeConfig.privateKeyBlob || "");

    (window as any).$crisp = [];
    (window as any).CRISP_WEBSITE_ID = websiteId;
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
            (window as any).$crisp.push(["set", "user:nickname", [nickname]]);
          });

          // ── Pre-fill message from ?message= or ?text= URL query param ──
          const params = new URLSearchParams(window.location.search);
          const messageParam = params.get("message") || params.get("text");
          if (messageParam) {
            (window as any).$crisp.push(["set", "message:text", [messageParam]]);
            (window as any).$crisp.push(["on", "chat:opened", () => {
              (window as any).$crisp.push(["set", "message:text", [messageParam]]);
            }]);
          }
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

        const brand = runtimeConfig.brand;
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

async function resolveNickname(privateKeyBlob: string): Promise<string> {
  const authFromHeader =
    typeof window.__CRISP_CONFIG?.auth === "string"
      ? window.__CRISP_CONFIG.auth
      : typeof window.__CRISP_AUTH === "string"
        ? window.__CRISP_AUTH
        : null;
  const authFromParam = new URLSearchParams(window.location.search).get(
    "authorization",
  );
  const authValue = authFromHeader || authFromParam;

  debug("URL:", window.location.href);
  debug("window.__CRISP_CONFIG:", !!window.__CRISP_CONFIG);
  debug(
    "middleware injected:",
    window.__CRISP_CONFIG?.injectedByMiddleware === true,
  );
  debug("private key env:", window.__CRISP_CONFIG?.privateKeyEnvName || "none");
  debug(
    "middleware has private key:",
    window.__CRISP_CONFIG?.hasPrivateKeyBlob === true,
  );
  debug("window.__CRISP_AUTH:", !!authFromHeader);
  debug("?authorization= param:", !!authFromParam);
  debug("privateKeyBlob length:", privateKeyBlob.length);

  if (authValue && privateKeyBlob) {
    debug("authValue (first 80 chars):", authValue.substring(0, 80) + "...");
    try {
      debug("Decrypting...");
      const payload: DecryptedPayload = await decryptAuthorization(
        authValue,
        privateKeyBlob,
      );
      debug("✓ Decrypt success! idmember:", payload.idmember);
      return payload.idmember;
    } catch (err) {
      debug("✗ Decrypt failed:", err);
    }
  } else if (authValue && !privateKeyBlob) {
    debug("⚠ Auth found but privateKeyBlob is empty");
  } else if (!authValue && privateKeyBlob) {
    debug("No auth from header or URL — using random fallback");
  } else {
    debug("⚠ Both auth and PRIVATE_KEY_BLOB are missing");
  }

  return randomFallback();
}

function getRuntimeConfig() {
  const injected = window.__CRISP_CONFIG;

  return {
    auth: injected?.auth ?? null,
    brand: (injected?.brand as BrandKey | undefined) ?? detectBrand(),
    websiteId: injected?.websiteId || WEBSITE_ID,
    privateKeyBlob: injected?.privateKeyBlob ?? "",
  };
}
