import { Controller, Get, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { CoinbaseOnrampService } from './coinbase-onramp.service'
import logger from '@common/utils/logger'

@Controller('coinbase')
export class CoinbaseReturnController {
  constructor(private readonly coinbaseOnramp: CoinbaseOnrampService) {}

  @Get('return')
  async handleReturn(@Req() req: Request, @Res() res: Response) {
    const ref = req.query['ref'] as string | undefined

    if (!ref) {
      res.status(400).send(returnPage('Missing reference', false))
      return
    }

    let status
    try {
      status = await this.coinbaseOnramp.getTransactionStatus(ref)
    } catch (err) {
      logger.info(
        `[Coinbase return] Status check failed for ref ${ref}: ${(err as Error).message}`,
      )
      res.send(
        returnPage(
          'Processing your payment — you will receive a WhatsApp confirmation shortly.',
          true,
        ),
      )
      return
    }

    if (status?.status === 'ONRAMP_TRANSACTION_STATUS_SUCCESS') {
      this.coinbaseOnramp
        .executeOnRampPayout(ref, status.transactionHash)
        .catch((err: Error) =>
          logger.info(`[Coinbase return] Payout error: ${err.message}`),
        )
      res.send(
        returnPage(
          'Payment received! You will get a WhatsApp confirmation shortly.',
          true,
        ),
      )
    } else if (status?.status === 'ONRAMP_TRANSACTION_STATUS_FAILED') {
      res.send(returnPage('Payment failed. Please try again.', false))
    } else {
      res.send(
        returnPage(
          'Payment is being processed — you will receive a WhatsApp confirmation shortly.',
          true,
        ),
      )
    }
  }
}

function returnPage(message: string, success: boolean): string {
  const color = success ? '#16a34a' : '#dc2626'
  const icon = success ? '✅' : '❌'
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SendSasa Payment</title>
  <style>
    body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}
    .card{background:white;border-radius:12px;padding:2rem;max-width:400px;width:90%;text-align:center;box-shadow:0 4px 6px rgba(0,0,0,0.07)}
    h1{font-size:2rem;margin:0 0 1rem}
    p{color:#374151;font-size:1rem;line-height:1.5}
    .brand{color:#6b7280;font-size:0.875rem;margin-top:1.5rem}
  </style>
</head>
<body>
  <div class="card">
    <h1>${icon}</h1>
    <p style="color:${color};font-weight:600">${message}</p>
    <p>You can close this window and return to WhatsApp.</p>
    <p class="brand">Powered by SendSasa</p>
  </div>
</body>
</html>`
}
