export function bytesToBase64Url(bytes: Uint8Array): string {
  const g: any = globalThis as any;
  if (typeof g.Buffer !== 'undefined') {
    return g.Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
export function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (b64.length % 4)) % 4;
  const padded = b64 + '='.repeat(padLen);
  const g: any = globalThis as any;
  if (typeof g.Buffer !== 'undefined') {
    return new Uint8Array(g.Buffer.from(padded, 'base64'));
  }
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function utf8ToBase64Url(s: string): string {
  const enc = new TextEncoder();
  return bytesToBase64Url(enc.encode(s));
}
export function base64UrlToUtf8(s: string): string {
  const dec = new TextDecoder();
  return dec.decode(base64UrlToBytes(s));
}
