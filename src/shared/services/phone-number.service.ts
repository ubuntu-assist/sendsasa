import { Injectable } from '@nestjs/common'
import {
  parsePhoneNumberWithError,
  isValidPhoneNumber,
  isPossiblePhoneNumber,
  validatePhoneNumberLength,
  CountryCode,
} from 'libphonenumber-js'

const DEFAULT_COUNTRY: CountryCode = 'CM'

// ── National numbering plan migration tables ──────────────────────────────────
//
// WhatsApp stores phone numbers as they were at account creation time. When a
// country later changes its numbering plan (inserting or removing a digit), old
// accounts still arrive in the pre-migration format and libphonenumber rejects
// them. The tables below encode the exact repair for each documented migration.
//
// PREPEND — a digit was inserted at `position` (0-indexed in the E.164 digits
//   after the leading +) to expand subscriber capacity.
//   Example: Cameroon 2014 — +237 97595198 → +237 6 97595198 (position 3)
//
// REMOVE — a legacy trunk/access digit at `position` must be dropped when
//   formatting for international use (number arrives TOO_LONG).
//   Example: Mexico 2019 — +52 1 XXXXXXXXXX → +52 XXXXXXXXXX (position 2)

interface PrependRule {
  digit: string
  position: number
}
interface RemoveRule {
  position: number
}

const PREPEND_RULES: Record<string, PrependRule> = {
  // Africa
  '237': { digit: '6', position: 3 }, // Cameroon 2014: mobile 8→9 digits
  // Latin America
  '55': { digit: '9', position: 4 }, // Brazil 2012-16: mobile 8→9 digits (after 2-digit area code)
  '51': { digit: '9', position: 2 }, // Peru 2010: all mobiles standardised to 9XXXXXXXX
  '56': { digit: '2', position: 2 }, // Chile 2012-13: landline 7→8 digits
  '58': { digit: '4', position: 2 }, // Venezuela 2006: mobile area codes (12→412, 14→414 …)
  '507': { digit: '6', position: 3 }, // Panama 2005: mobile 7→8 digits
  '504': { digit: '2', position: 3 }, // Honduras 2010: fixed 7→8 digits
  '593': { digit: '9', position: 3 }, // Ecuador 2001: mobile 8→9 digits
}

const REMOVE_RULES: Record<string, RemoveRule> = {
  '52': { position: 2 }, // Mexico 2019: drop legacy '1' after +52 for mobiles
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function insertAt(noPlus: string, pos: number, digit: string): string {
  return '+' + noPlus.slice(0, pos) + digit + noPlus.slice(pos)
}

function removeAt(noPlus: string, pos: number): string {
  return '+' + noPlus.slice(0, pos) + noPlus.slice(pos + 1)
}

/**
 * Repair a phone number that libphonenumber says is TOO_SHORT or TOO_LONG.
 *
 * Strategy:
 *   1. Look up the country in the migration table and apply the known exact fix.
 *      This is the only approach that guarantees the right digit when multiple
 *      digits could produce a structurally valid number (e.g. Cameroon 6XX vs 7XX).
 *
 *   2. Oracle fallback for countries not in the table: try inserting each digit
 *      at every position, checking isValidPhoneNumber() after each attempt.
 *      Country-code boundary positions (3, 2, 1) are tried before inner positions
 *      so the most likely migration point is hit first.
 *      This is guaranteed correct when only one candidate passes validation, and
 *      best-effort (first valid found) when multiple candidates pass.
 */
function repairPhoneNumber(phone: string): string | null {
  if (!phone.startsWith('+')) return null

  const noPlus = phone.slice(1)
  const reason = validatePhoneNumberLength(phone)

  if (reason === 'TOO_SHORT') {
    // 1. Lookup table — try longest country code first to avoid prefix collisions
    for (const ccLen of [3, 2, 1]) {
      const rule = PREPEND_RULES[noPlus.slice(0, ccLen)]
      if (rule) {
        const candidate = insertAt(noPlus, rule.position, rule.digit)
        if (isValidPhoneNumber(candidate)) return candidate
      }
    }

    // 2. Oracle — try CC boundaries first (positions 3→2→1), then inner positions
    const positions = [
      3,
      2,
      1,
      ...Array.from(
        { length: Math.max(0, noPlus.length - 3) },
        (_, i) => i + 4,
      ),
    ]
    for (const pos of positions) {
      if (pos > noPlus.length) continue
      for (const digit of ['9', '6', '7', '8', '0', '1', '2', '3', '4', '5']) {
        const candidate = insertAt(noPlus, pos, digit)
        if (isValidPhoneNumber(candidate)) return candidate
      }
    }
  }

  if (reason === 'TOO_LONG') {
    // 1. Lookup table
    for (const ccLen of [3, 2, 1]) {
      const rule = REMOVE_RULES[noPlus.slice(0, ccLen)]
      if (rule) {
        const candidate = removeAt(noPlus, rule.position)
        if (isValidPhoneNumber(candidate)) return candidate
      }
    }

    // 2. Oracle — try removing each digit from position 1 onward
    for (let pos = 1; pos < noPlus.length; pos++) {
      const candidate = removeAt(noPlus, pos)
      if (isValidPhoneNumber(candidate)) return candidate
    }
  }

  return null
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Normalize a phone number to E.164 format (e.g. "+237612345678").
 *
 * strict: false (default) — used for WhatsApp-provided wa_id values.
 *   Applies migration repair then falls back to accepting any plausible number
 *   so wallet creation never crashes on a legacy-format wa_id.
 *
 * strict: true — used for user-entered recipient numbers in flow forms.
 *   Throws on anything that is not strictly valid so users see an error message.
 */
export function normalizeToE164(
  phone: string,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
  options: { strict?: boolean } = {},
): string {
  const { strict = false } = options
  const cleaned = phone.trim().replaceAll(/\s+/g, '')

  // 1. Strict parse — handles the vast majority of well-formed numbers
  try {
    const parsed = parsePhoneNumberWithError(cleaned, defaultCountry)
    if (parsed.isValid()) return parsed.number
  } catch {}

  // 2. Migration repair — TOO_SHORT (digit prepend) or TOO_LONG (trunk removal)
  const repaired = repairPhoneNumber(cleaned)
  if (repaired) return repaired

  // 3. Possible but not strictly valid — number has the right length for its
  //    country but libphonenumber's regex doesn't match (newly allocated ranges)
  if (!strict && isPossiblePhoneNumber(cleaned, defaultCountry)) {
    try {
      return parsePhoneNumberWithError(cleaned, defaultCountry).number
    } catch {}
    if (/^\+\d{7,15}$/.test(cleaned)) return cleaned
  }

  // 4. Last-resort lenient fallback (WhatsApp-provided numbers only)
  if (!strict && /^\+\d{7,15}$/.test(cleaned)) return cleaned

  throw new Error(`Invalid phone number: ${phone}`)
}

export function isE164(phone: string): boolean {
  return /^\+\d{7,15}$/.test(phone) && isValidPhoneNumber(phone)
}

export function maskPhone(phone: string): string {
  if (phone.length < 8) return '***'
  return phone.slice(0, 6) + '***' + phone.slice(-3)
}

@Injectable()
export class PhoneNumberService {
  normalizeToE164(phone: string, defaultCountry?: CountryCode, options?: { strict?: boolean }) {
    return normalizeToE164(phone, defaultCountry, options)
  }
  isE164(phone: string) { return isE164(phone) }
  maskPhone(phone: string) { return maskPhone(phone) }
}
