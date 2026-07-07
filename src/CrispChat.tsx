import { useEffect, useRef } from "react";

const WEBSITE_ID = "1e652069-9ee7-4c7f-84df-49a6f33c8efd";

/**
 * Loads the Crisp chat widget and renders it full-screen.
 *
 * Strategy:
 * 1. Sets `window.$crisp`, `CRISP_WEBSITE_ID`, and `CRISP_RUNTIME_CONFIG`
 *    BEFORE injecting the loader script.
 * 2. Injects the official loader from `client.crisp.chat/l.js`.
 * 3. Once `.crisp-client` appears in the DOM, pushes commands to
 *    open + show the chat maximized.
 * 4. CSS overrides in `index.css` stretch everything to fill the viewport.
 */
export default function CrispChat() {
  const injectedRef = useRef(false);

  useEffect(() => {
    // ── Guard against StrictMode double-fire ──
    if (injectedRef.current) return;
    injectedRef.current = true;

    // ── 1. Setup globals ──
    (window as any).$crisp = [];
    (window as any).CRISP_WEBSITE_ID = WEBSITE_ID;
    (window as any).CRISP_RUNTIME_CONFIG = {
      lock_full_view: true,
      lock_maximized: true,
    };

    // ── 2. Inject loader ──
    const script = document.createElement("script");
    script.src = "https://client.crisp.chat/l.js";
    script.async = true;

    // ── 3. Once the client DOM is present, open the chat ──
    const poll = () => {
      if (document.querySelector(".crisp-client")) {
        // Small delay to let Vue render the initial state
        requestAnimationFrame(() => {
          (window as any).$crisp.push(["do", "chat:show"]);
          (window as any).$crisp.push(["do", "chat:open"]);

          // Verify integration: set a known visitor nickname
          (window as any).$crisp.push([
            "set",
            "user:nickname",
            ["Rizki Nasution"],
          ]);
        });
      } else {
        requestAnimationFrame(poll);
      }
    };

    // Start polling after the script has a chance to execute
    script.onload = () => setTimeout(poll, 500);

    document.head.appendChild(script);

    // ── 4. Cleanup ──
    return () => {
      injectedRef.current = false;

      // Remove DOM nodes Crisp injected
      document.querySelector(".crisp-client")?.remove();
      document.getElementById("crisp-loader")?.remove();

      // Remove its stylesheets & cached scripts
      document
        .querySelectorAll(
          'link[href*="client.crisp.chat"], script[src*="client.crisp.chat"]',
        )
        .forEach((el) => el.remove());

      // Wipe global state so a re-mount starts fresh
      delete (window as any).$crisp;
      delete (window as any).$__CRISP_INSTANCE;
      delete (window as any).$__CRISP_INCLUDED;
      delete (window as any).CRISP_WEBSITE_ID;
      delete (window as any).CRISP_RUNTIME_CONFIG;
    };
  }, []);

  // Crisp manages its own DOM – we render nothing here
  return null;
}
