/**
 * Vercel serverless function – proxies the Reseller API lookup.
 *
 * The actual reseller endpoint uses cookie-based auth (PHPSESSID), so we
 * can't call it directly from the browser.  This function runs server-side,
 * makes the request with the session cookie from env, and returns
 * structured JSON.
 *
 * Environment variables:
 *   RESELLER_PHPSESSID  – PHP session ID for the reseller API
 *   RESELLER_BASE_URL   – default: https://rmwapps.otoreport.com/reseller/reseller/
 */

import type { IncomingMessage, ServerResponse } from "node:http";

// ── Types ──

interface ResellerRow {
  cells: string[];
}

interface ResellerApiResponse {
  rows: ResellerRow[];
  headers: string[];
  rawHtml: string;
}

/** Minimal JSON body type */
interface ReqBody {
  idmember?: string;
}

// ── HTML table parser ──

function extractTableData(html: string): {
  headers: string[];
  rows: ResellerRow[];
} {
  const headers: string[] = [];
  const rows: ResellerRow[] = [];

  // Extract <table>…</table>
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return { headers, rows };

  const tableHtml = tableMatch[1];

  // Extract all <tr> blocks
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  let isHeader = true;

  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const tdHtml = trMatch[1]!;

    // Extract cell contents (<th> or <td>)
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(tdHtml)) !== null) {
      // Strip HTML tags from cell content
      const text = cellMatch[1]!.replace(/<[^>]*>/g, "").trim();
      cells.push(text);
    }

    if (cells.length === 0) continue;

    if (isHeader) {
      // First row might be a header row
      const hasTh = /<th/i.test(tdHtml);
      if (hasTh) {
        headers.push(...cells);
        continue;
      }
    }

    isHeader = false;
    rows.push({ cells });
  }

  return { headers, rows };
}

// ── Helpers to read the JSON body ──

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(
  res: ServerResponse,
  status: number,
  data: Record<string, unknown>,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ── Handler ──

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Only accept POST
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  let body: ReqBody;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw) as ReqBody;
  } catch {
    json(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const { idmember } = body;

  if (!idmember || typeof idmember !== "string" || idmember.length === 0) {
    json(res, 400, { error: "Missing or invalid idmember" });
    return;
  }

  const phpsessid = process.env.RESELLER_PHPSESSID;
  if (!phpsessid) {
    json(res, 500, { error: "RESELLER_PHPSESSID not configured" });
    return;
  }

  const baseUrl =
    process.env.RESELLER_BASE_URL ??
    "https://rmwapps.otoreport.com/reseller/reseller/";

  try {
    const apiResponse = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `PHPSESSID=${phpsessid}`,
      },
      body: new URLSearchParams({
        tanggal: "11-07-2026 - 11-07-2026",
        kriteria: "kode",
        keyword: idmember,
        order: "DESC",
        limit: "30",
      }),
    });

    if (!apiResponse.ok) {
      json(res, 502, {
        error: "Reseller API returned non-OK status",
        status: apiResponse.status,
      });
      return;
    }

    const rawHtml = await apiResponse.text();
    const { headers, rows } = extractTableData(rawHtml);

    const result: ResellerApiResponse = { rows, headers, rawHtml };
    json(res, 200, result as unknown as Record<string, unknown>);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error calling reseller API";
    json(res, 502, { error: message });
  }
}
