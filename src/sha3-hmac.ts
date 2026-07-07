/**
 * HMAC-SHA3-512 implementation using the `js-sha3` library.
 *
 * The Web Crypto API does not support SHA3-512 for HMAC in all browsers,
 * so we implement it manually here.
 *
 * HMAC construction (RFC 2104):
 *   HMAC(K, m) = H((K' ⊕ opad) || H((K' ⊕ ipad) || m))
 *
 * For SHA3-512:
 *   B (block size) = 72 bytes (the rate r of SHA3-512)
 *   L (output size) = 64 bytes
 */

// @ts-ignore – js-sha3 ships its own types
import { sha3_512 } from "js-sha3";

/** Block size for SHA3-512 (rate r = 576 bits = 72 bytes) */
const B = 72;

/**
 * Compute HMAC-SHA3-512.
 *
 * @param key   HMAC key (raw bytes)
 * @param data  Message to authenticate (raw bytes)
 * @returns     64-byte HMAC digest
 */
export function hmacSha3_512(key: Uint8Array, data: Uint8Array): Uint8Array {
  // 1. If key is longer than B, hash it
  let k: Uint8Array;
  if (key.length > B) {
    const hashBuf = sha3_512.create().update(key).arrayBuffer();
    k = new Uint8Array(hashBuf);
  } else {
    k = new Uint8Array(key);
  }

  // 2. Pad key to B bytes
  const paddedKey = new Uint8Array(B);
  paddedKey.set(k);

  // 3. Compute inner hash: H((K ⊕ ipad) || message)
  const ipad = new Uint8Array(B);
  const opad = new Uint8Array(B);
  for (let i = 0; i < B; i++) {
    ipad[i] = paddedKey[i]! ^ 0x36;
    opad[i] = paddedKey[i]! ^ 0x5c;
  }

  const innerHash = sha3_512.create().update(ipad).update(data).arrayBuffer();

  // 4. Compute outer hash: H((K ⊕ opad) || inner_hash)
  const result = sha3_512
    .create()
    .update(opad)
    .update(new Uint8Array(innerHash))
    .arrayBuffer();

  return new Uint8Array(result);
}
