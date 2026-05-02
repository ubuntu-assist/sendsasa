import { Router, Request, Response } from 'express'
import crypto from 'node:crypto'
import config from '../utils/config'
import logger from '../utils/logger'
import { normalizePEMKey } from '../utils/normalize-key'

const router = Router()

let jwksCache: object | null = null

function buildJwks(): object {
  if (jwksCache) return jwksCache

  const publicKeyPem = normalizePEMKey(config.JWT_PUBLIC_KEY!)
  const publicKey = crypto.createPublicKey(publicKeyPem)
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>

  jwksCache = {
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

  return jwksCache
}

// Apple Pay domain verification — file content provided by Coinbase CDP after domain registration
router.get('/.well-known/apple-developer-merchantid-domain-association', (_req: Request, res: Response) => {
  const content = config.APPLE_PAY_DOMAIN_VERIFICATION
  if (!content) {
    res.status(404).send('Not configured')
    return
  }
  res.setHeader('Content-Type', 'text/plain')
  res.send(content)
})

router.get('/.well-known/jwks.json', (_req: Request, res: Response) => {
  try {
    const jwks = buildJwks()
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.json(jwks)
  } catch (error) {
    logger.error('Error serving JWKS:', error)
    res.status(500).json({ error: 'Failed to load JWKS' })
  }
})

export default router
