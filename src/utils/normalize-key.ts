/**
 * Normalize PEM key from environment variable
 * Handles various formats that cloud platforms (Render, Railway, etc.) might use
 *
 * @param key - The PEM key string from environment variable
 * @param keyType - 'PRIVATE' or 'PUBLIC' for error messages
 * @returns Properly formatted PEM key
 */
export function normalizePEMKey(key: string): string {
  let normalizedKey = key.trim()

  if (normalizedKey.includes('|')) {
    normalizedKey = normalizedKey.replaceAll('|', '\n')
  }

  if (normalizedKey.includes(String.raw`\n`)) {
    normalizedKey = normalizedKey.replaceAll(String.raw`\n`, '\n')
  }

  normalizedKey = normalizedKey.replaceAll(/^["']|["']$/g, '')

  return normalizedKey
}
