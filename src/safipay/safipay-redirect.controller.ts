import { Controller, Get, Param, Res } from '@nestjs/common'
import { Response } from 'express'
import { Invoice } from './invoice.schema'

@Controller('r')
export class SafiPayRedirectController {
  @Get(':code')
  async redirect(@Param('code') code: string, @Res() res: Response) {
    const invoice = await Invoice.findOne({ shortCode: code.toUpperCase() })
    if (!invoice || !(invoice as any).paymentPageUrl)
      return res.status(404).send('Payment link not found')
    return res.redirect(302, (invoice as any).paymentPageUrl)
  }
}
