/**
 * Browser-side decryption for Hexaflate Encrypted Authorization.
 * Uses Web Crypto API: RSA-OAEP + AES-256-CBC + HMAC-SHA512.
 */

export interface DecryptedPayload {
  idmember: string;
  token: string;
  date: string;
}

// ═══════════════════════════════════════════════════════════
//  Byte helpers – always return Uint8Array backed by a
//  fresh ArrayBuffer so .buffer is ArrayBuffer not SharedArrayBuffer.
// ═══════════════════════════════════════════════════════════

function newU8(n: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(n)) as Uint8Array<ArrayBuffer>;
}

function copyRange(
  src: Uint8Array,
  start: number,
  end?: number,
): Uint8Array<ArrayBuffer> {
  const e = end ?? src.length;
  const out = newU8(e - start);
  for (let i = start; i < e; i++) out[i - start] = src[i]!;
  return out;
}

function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = newU8(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexEncode(buf: ArrayBuffer): string {
  const v = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < v.length; i++) s += v[i]!.toString(16).padStart(2, "0");
  return s;
}

function hexDecode(hex: string): Uint8Array<ArrayBuffer> {
  const out = newU8(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    out[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return out;
}

// ── PEM → DER ──

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  return fromBase64(
    pem
      .replace(/-----BEGIN [\w\s]+ KEY-----/g, "")
      .replace(/-----END [\w\s]+ KEY-----/g, "")
      .replace(/\s/g, ""),
  );
}

// ═══════════════════════════════════════════════════════════
//  DER building (PKCS#1 → PKCS#8)
// ═══════════════════════════════════════════════════════════

function derTag(tag: number, content: Uint8Array): Uint8Array<ArrayBuffer> {
  const len = content.length;
  const hdr: number[] =
    len < 0x80
      ? [tag, len]
      : (() => {
          const b: number[] = [];
          let n = len;
          while (n > 0) {
            b.unshift(n & 0xff);
            n >>>= 8;
          }
          return [tag, 0x80 | b.length, ...b];
        })();
  const out = newU8(hdr.length + len);
  for (let i = 0; i < hdr.length; i++) out[i] = hdr[i]!;
  out.set(content, hdr.length);
  return out;
}

function derSeq(c: Uint8Array) {
  return derTag(0x30, c);
}
function derOct(c: Uint8Array) {
  return derTag(0x04, c);
}
function derInt(v: number): Uint8Array<ArrayBuffer> {
  const b: number[] = [];
  let n = Math.abs(v);
  while (n > 0) {
    b.unshift(n & 0xff);
    n >>>= 8;
  }
  if (b.length === 0) b.push(0);
  if (b[0]! & 0x80) b.unshift(0);
  const d = newU8(b.length);
  for (let i = 0; i < b.length; i++) d[i] = b[i]!;
  return derTag(0x02, d);
}

function cat(...as: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = newU8(as.reduce((s, a) => s + a.length, 0));
  let off = 0;
  for (const a of as) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function pkcs1ToPkcs8(k: Uint8Array): Uint8Array<ArrayBuffer> {
  const oid = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
    0x01, 0x05, 0x00,
  ]);
  return derSeq(
    cat(derInt(0), derSeq(oid as Uint8Array<ArrayBuffer>), derOct(k)),
  );
}

// ── Constant-time compare ──

function timingSafe(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

// ═══════════════════════════════════════════════════════════
//  Main decrypt – all Web Crypto calls inline with `as any`
//  to work around TS 6.x strict ArrayBufferLike differences.
// ═══════════════════════════════════════════════════════════

/**
 * Decrypt a Hexaflate encrypted authorization header.
 *
 * @param authHeader       `ENC Key="<base64>", Signature="<base64>"`
 * @param privateKeyBlob   Base64 blob from the admin panel
 */
export async function decryptAuthorization(
  authHeader: string,
  privateKeyBlob: string,
): Promise<DecryptedPayload> {
  // 1. Parse header
  const m = authHeader.match(/ENC Key="([^"]+)", Signature="([^"]+)"/);
  if (!m) throw new Error("Invalid auth header");

  const authKey = fromBase64(m[1]!);
  const signature = fromBase64(m[2]!);
  const mix = fromBase64(privateKeyBlob);
  if (mix.length < 80) throw new Error("Blob too short");

  const iv = copyRange(mix, 0, 16);
  const origHmac = copyRange(mix, 16, 80);
  const encPem = copyRange(mix, 80);

  // Bypass TS 6.x strict BufferSource / KeyUsage mismatches
  // – correct at runtime.
  const subtle = crypto.subtle as any;

  // 2. Derive HMAC key
  const sha512Buf = await subtle.digest("SHA-512", authKey);
  const hmacKey = hexDecode(hexEncode(sha512Buf).substring(0, 64));

  // 3. Verify HMAC-SHA512
  const hk = await subtle.importKey(
    "raw",
    hmacKey,
    {
      name: "HMAC",
      hash: "SHA-512",
    },
    false,
    ["sign"],
  );
  const newHmac = new Uint8Array(await subtle.sign("HMAC", hk, encPem));
  if (!timingSafe(origHmac, newHmac)) throw new Error("HMAC mismatch");

  // 4. AES-256-CBC → PEM string
  const ak = await subtle.importKey("raw", authKey, "AES-CBC", false, [
    "decrypt",
  ]);
  const pemBuf = await subtle.decrypt({ name: "AES-CBC", iv }, ak, encPem);
  const pemString = new TextDecoder().decode(pemBuf);

  // 5. Import RSA key (try PKCS#8, fallback PKCS#1)
  let rk: any;
  const rsaParams = { name: "RSA-OAEP", hash: "SHA-1" };
  try {
    rk = await subtle.importKey(
      "pkcs8",
      pemToDer(pemString),
      rsaParams,
      false,
      ["decrypt"],
    );
  } catch {
    rk = await subtle.importKey(
      "pkcs8",
      pkcs1ToPkcs8(pemToDer(pemString)),
      rsaParams,
      false,
      ["decrypt"],
    );
  }

  // 6. RSA-OAEP → JSON
  const raw = await subtle.decrypt({ name: "RSA-OAEP" }, rk, signature);
  return JSON.parse(new TextDecoder().decode(raw)) as DecryptedPayload;
}
