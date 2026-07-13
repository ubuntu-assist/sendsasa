import { Controller, Get, Param, Res } from '@nestjs/common'
import { Response } from 'express'
import { InvoiceRepository } from '@domain/repositories/invoice.repository'

@Controller('r')
export class SafiPayRedirectController {
  constructor(private readonly invoices: InvoiceRepository) {}

  @Get(':code')
  async redirect(@Param('code') code: string, @Res() res: Response) {
    const invoice = await this.invoices.findByShortCode(code.toUpperCase())
    if (!invoice || !(invoice as any).paymentPageUrl)
      return res.status(404).send('Payment link not found')
    return res.redirect(302, (invoice as any).paymentPageUrl)
  }
}
