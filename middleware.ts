type BrandKey = "rmwapps" | "zonaloket" | "loketkuota" | "rmwindonesia";

const BRAND_KEYS: BrandKey[] = [
  "rmwapps",
  "zonaloket",
  "loketkuota",
  "rmwindonesia",
];

const ASSET_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".mjs",
  ".ts",
  ".tsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".map",
  ".json",
  ".txt",
  ".xml",
  ".woff",
  ".woff2",
]);

function detectBrand(url: URL): BrandKey {
  const fromQuery = url.searchParams.get("brand")?.toLowerCase();
  if (fromQuery && BRAND_KEYS.includes(fromQuery as BrandKey)) {
    return fromQuery as BrandKey;
  }

  const segment = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (segment && BRAND_KEYS.includes(segment as BrandKey)) {
    return segment as BrandKey;
  }

  return "rmwapps";
}

function isDocumentRequest(request: Request, url: URL): boolean {
  const pathname = url.pathname.toLowerCase();
  if (pathname === "/" || pathname.endsWith(".html")) return true;

  const lastSegment = pathname.split("/").pop() || "";
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex >= 0) {
    const ext = lastSegment.slice(dotIndex);
    if (ASSET_EXTENSIONS.has(ext)) return false;
  }

  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function readBrandConfig(brand: BrandKey) {
  const envBrand = brand.toUpperCase();

  return {
    brand,
    privateKeyBlob: process.env[`CRISP_PRIVATE_KEY_BLOB_${envBrand}`] || "",
  };
}

export default async function middleware(
  request: Request,
): Promise<Response | undefined> {
  if (request.headers.get("x-mw-internal")) return;

  const url = new URL(request.url);
  if (!isDocumentRequest(request, url)) return;

  const auth = request.headers.get("authorization");
  const brand = detectBrand(url);
  const config = readBrandConfig(brand);

  const htmlResponse = await fetch(new URL("/index.html", url.origin), {
    headers: { "x-mw-internal": "1" },
  });

  if (!htmlResponse.ok) return;

  const html = await htmlResponse.text();
  const injected = JSON.stringify({
    ...config,
    auth,
  });

  const modified = html.replace(
    "</head>",
    `<script>window.__CRISP_AUTH=${JSON.stringify(auth)};window.__CRISP_CONFIG=${injected}</script></head>`,
  );

  return new Response(modified, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
