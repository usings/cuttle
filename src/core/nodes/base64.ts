function normalizeBase64(value: string) {
  const normalized = value.replaceAll(/\s+/g, "").replaceAll("-", "+").replaceAll("_", "/")
  return normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
}

export function decodeBase64(value: string) {
  const binary = atob(normalizeBase64(value))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeBase64(value: string, urlSafe = false) {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const encoded = btoa(binary)
  return urlSafe
    ? encoded.replaceAll("+", "-").replaceAll("/", "_").replaceAll(/=+$/g, "")
    : encoded
}

export function maybeDecodeBase64(value: string) {
  const compact = value.trim().replaceAll(/\s+/g, "")
  if (!compact || compact.length < 8 || !/^[A-Za-z0-9+/_=-]+$/.test(compact)) return null

  try {
    const decoded = decodeBase64(compact).trim()
    return /(?:^|\n)(?:ss|ssr|vmess|vless|trojan|hysteria2?|hy2|tuic|wireguard|wg|anytls|socks5?|https?):\/\//m.test(
      decoded,
    ) || /(?:^|\n)(?:proxies\s*:|[^\n=]+\s*=\s*[^\n,]+,)/m.test(decoded)
      ? decoded
      : null
  } catch {
    return null
  }
}
