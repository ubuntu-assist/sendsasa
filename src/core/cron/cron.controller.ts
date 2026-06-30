import { Controller, Get } from '@nestjs/common'

@Controller('cron')
export class CronController {
  private pingCount = 0
  private readonly startTime = Date.now()

  @Get('activate')
  activate() {
    this.pingCount++
    const uptime = Math.floor((Date.now() - this.startTime) / 1000 / 60)

    console.log(`Self-ping #${this.pingCount} received at ${new Date().toISOString()}`)
    console.log(`App uptime: ${uptime} minutes`)

    return {
      status: 'ok',
      message: 'Keep-alive ping successful',
      timestamp: new Date().toISOString(),
      pingCount: this.pingCount,
      uptimeMinutes: uptime,
    }
  }
}
