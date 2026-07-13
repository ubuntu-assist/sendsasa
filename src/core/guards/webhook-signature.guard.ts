import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import { createHmac } from 'node:crypto'

const APP_SECRET = process.env.WHATSAPP_APP_SECRET

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!APP_SECRET) return true

    const req = context.switchToHttp().getRequest<Request>()
    const signature = req.headers['x-hub-signature-256'] as string | undefined
    if (!signature) return false

    // Meta signs the raw body; req.body is already JSON-parsed here.
    // Express must be configured with `verify` to preserve rawBody for full validation.
    // We fall back to re-serialising the parsed body when rawBody is unavailable.
    const raw: Buffer | string =
      (req as any).rawBody ?? JSON.stringify(req.body)

    const expected = `sha256=${createHmac('sha256', APP_SECRET!)
      .update(raw)
      .digest('hex')}`

    return signature === expected
  }
}
