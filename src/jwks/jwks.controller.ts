import { Controller, Get, Res } from '@nestjs/common'
import crypto from 'node:crypto'
import type { Response } from 'express'
import config from '../utils/config'
import logger from '../utils/logger'
import { normalizePEMKey } from '../utils/normalize-key'

@Controller('.well-known/.well-known')
export class JwksController {
  private jwksCache: object | null = null

  private buildJwks(): object {
    if (this.jwksCache) return this.jwksCache

    const publicKeyPem = normalizePEMKey(config.JWT_PUBLIC_KEY!)
    const publicKey = crypto.createPublicKey(publicKeyPem)
    const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>

    this.jwksCache = {
      keys: [
        {
          kty: jwk.kty,
          n: jwk.n,
          e: jwk.e,
          kid: config.JWT_KID,
          use: 'sig',
          alg: 'RS256',
        },
      ],
    }

    return this.jwksCache
  }

  @Get('apple-developer-merchantid-domain-association')
  applePayVerification(@Res() res: Response) {
    const content = config.APPLE_PAY_DOMAIN_VERIFICATION
    if (!content) {
      res.status(404).send('Not configured')
      return
    }
    res.setHeader('Content-Type', 'text/plain')
    res.send(content)
  }

  @Get('jwks.json')
  getJwks(@Res() res: Response) {
    try {
      const jwks = this.buildJwks()
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.json(jwks)
    } catch (error) {
      logger.error('Error serving JWKS:', error)
      res.status(500).json({ error: 'Failed to load JWKS' })
    }
  }
}
