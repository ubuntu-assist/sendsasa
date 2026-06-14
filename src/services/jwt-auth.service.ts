import { Injectable } from '@nestjs/common'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import config from '../utils/config'
import logger from '../utils/logger'
import { normalizePEMKey } from '../utils/normalize-key'

const JWT_ISSUER = config.JWT_ISSUER
const JWT_AUDIENCE = config.JWT_AUDIENCE
const JWT_KID = config.JWT_KID
const JWT_EXPIRY = '1h'

@Injectable()
export class JwtAuthService {
  /**
   * Generate a fresh JWT for Web3Auth authentication.
   * Must be called once per Web3Auth connect() — tokens are single-use.
   */
  generateToken(phoneNumber: string): string {
    const privateKey = normalizePEMKey(config.JWT_PRIVATE_KEY!)

    const token = jwt.sign(
      {
        sub: phoneNumber,
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
        jti: crypto.randomUUID(),
      },
      privateKey,
      {
        algorithm: 'RS256',
        keyid: JWT_KID,
        expiresIn: JWT_EXPIRY,
      },
    )

    logger.info(`JWT generated for phone: ${phoneNumber.slice(0, 6)}***`)
    return token
  }
}

export const jwtAuthService = new JwtAuthService()
