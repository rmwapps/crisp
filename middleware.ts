/**
 * Vercel Edge Middleware
 *
 * Hexaflate WebView sends `Authorization: ENC Key="...", Signature="..."`
 * as an HTTP header. Since browser JS cannot read request headers,
 * this middleware captures it and injects it into the HTML as
 * `window.__CRISP_AUTH` before the page loads.
 *
 * Runs at the edge on every request to `/` or `/*.html`.
 */

export default async function middleware(
  request: Request,
): Promise<Response | undefined> {
  const auth = request.headers.get("authorization");

  // No auth header → pass through to static files
  if (!auth) return;

  const url = new URL(request.url);

  // Only intercept HTML document requests
  const path = url.pathname;
  if (!path.endsWith("/") && !path.endsWith(".html") && path !== "") {
    return;
  }

  // Avoid infinite loop when we fetch the HTML ourselves
  if (request.headers.get("x-mw-internal")) return;

  // Determine the correct static file path
  const staticPath = path.endsWith(".html")
    ? path
    : path.replace(/\/?$/, "/index.html");

  // Fetch the actual static HTML from Vercel's static handler
  const staticUrl = new URL(staticPath, url.origin).toString();
  const htmlResponse = await fetch(staticUrl, {
    headers: { "x-mw-internal": "1" },
  });

  if (!htmlResponse.ok) return;

  const html = await htmlResponse.text();

  // Inject auth as a script tag before </head>
  const safe = JSON.stringify(auth);
  const modified = html.replace(
    "</head>",
    `<script>window.__CRISP_AUTH=${safe}</script></head>`,
  );

  return new Response(modified, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
