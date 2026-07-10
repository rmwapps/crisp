/**
 * Reseller API "middleware" – client-side service.
 *
 * Called after auth decryption succeeds.  Sends the decrypted `idmember`
 * to the Vercel proxy endpoint (`/api/reseller`) which in turn fetches
 * and parses the raw-HTML reseller page, returning structured JSON.
 *
 * Usage:
 *   const info = await fetchResellerInfo(payload.idmember);
 *   // info.rows[0]?.cells  →  [kode, nama, email, telepon, …]
 */

export interface ResellerRow {
  cells: string[];
}

export interface ResellerInfo {
  rows: ResellerRow[];
  headers: string[];
  /** First-row shortcut – the most relevant row for this idmember */
  firstRow: string[] | null;
  error?: string;
}

// ── Public API ──

/**
 * Fetch reseller information for a given member ID.
 *
 * @param idmember  – Decrypted member ID (e.g. "APPS0119")
 * @param endpoint  – Proxy endpoint (default `/api/reseller`)
 */
export async function fetchResellerInfo(
  idmember: string,
  endpoint = "/api/reseller",
): Promise<ResellerInfo> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idmember }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        rows: [],
        headers: [],
        firstRow: null,
        error: body.error ?? `HTTP ${res.status}`,
      };
    }

    const data = await res.json();

    const rows: ResellerRow[] = data.rows ?? [];
    const headers: string[] = data.headers ?? [];

    return {
      rows,
      headers,
      firstRow: rows.length > 0 ? rows[0]!.cells : null,
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Unknown error fetching reseller info";
    return {
      rows: [],
      headers: [],
      firstRow: null,
      error: msg,
    };
  }
}

/**
 * Simple label map for common reseller columns.
 * Keyed by lower-cased header text.
 */
export const RESELLER_COLUMN_LABELS: Record<string, string> = {
  kode: "Kode",
  nama: "Nama",
  "nama reseller": "Nama Reseller",
  email: "Email",
  telepon: "Telepon",
  nohp: "No. HP",
  hp: "No. HP",
  alamat: "Alamat",
  kota: "Kota",
  provinsi: "Provinsi",
  status: "Status",
  saldo: "Saldo",
  deposit: "Deposit",
};

/**
 * Build a map of known column names → cell value for the first row, if possible.
 */
export function mapFirstRow(
  info: ResellerInfo,
): Record<string, string> {
  const map: Record<string, string> = {};

  if (!info.firstRow) return map;

  const keys = info.headers.length > 0
    ? info.headers.map((h) => h.toLowerCase().trim())
    : info.firstRow.map((_, i) => `kolom_${i}`);

  for (let i = 0; i < info.firstRow.length && i < keys.length; i++) {
    map[keys[i]!] = info.firstRow[i] ?? "";
  }

  return map;
}
