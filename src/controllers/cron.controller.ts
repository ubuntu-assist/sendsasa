import { Request, Response } from 'express'

let pingCount = 0
const startTime = Date.now()

export const cronResponse = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  pingCount++

  const uptime = Math.floor((Date.now() - startTime) / 1000 / 60)

  console.log(
    `🟢 Self-ping #${pingCount} received at ${new Date().toISOString()}`,
  )
  console.log(`⏱️  App uptime: ${uptime} minutes`)

  res.status(200).json({
    status: 'ok',
    message: 'Keep-alive ping successful',
    timestamp: new Date().toISOString(),
    pingCount: pingCount,
    uptimeMinutes: uptime,
  })
}
