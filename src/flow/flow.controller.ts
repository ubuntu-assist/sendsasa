import { Controller, HttpCode, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { FlowDataExchangeService } from './flow-data-exchange.service'

@Controller('api')
export class FlowController {
  constructor(private readonly flowDataExchange: FlowDataExchangeService) {}

  @Post('flow-data-exchange')
  @HttpCode(200)
  async handleDataExchange(@Req() req: Request, @Res() res: Response) {
    try {
      await this.flowDataExchange.handleDataExchange(req, res)
    } catch (error) {
      console.error('Flow data exchange error:', error)
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' })
      }
    }
  }
}
