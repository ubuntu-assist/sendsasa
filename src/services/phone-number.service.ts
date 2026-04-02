import {
  parsePhoneNumberWithError,
  isValidPhoneNumber,
  CountryCode,
} from 'libphonenumber-js'

const DEFAULT_COUNTRY: CountryCode = 'CM'

/**
 * Normalize a phone number to E.164 format (e.g. "+237612345678").
 * This is required before using a phone number as a Web3Auth verifier_id.
 *
 * @throws if the phone number cannot be parsed or is invalid
 */
export function normalizeToE164(
  phone: string,
  defaultCountry: CountryCode = DEFAULT_COUNTRY,
): string {
  const cleaned = phone.replaceAll(/\s+/g, '')

  try {
    const parsed = parsePhoneNumberWithError(cleaned, defaultCountry)

    if (!parsed.isValid()) {
      throw new Error(`Invalid phone number: ${phone}`)
    }

    return parsed.number
  } catch (error: any) {
    if (error.message.startsWith('Invalid phone number')) throw error
    throw new Error(`Failed to parse phone number "${phone}": ${error.message}`)
  }
}

export function isE164(phone: string): boolean {
  return /^\+\d{7,15}$/.test(phone) && isValidPhoneNumber(phone)
}

export function maskPhone(phone: string): string {
  if (phone.length < 8) return '***'
  return phone.slice(0, 6) + '***' + phone.slice(-3)
}
