import { Router } from 'express'

const router = Router()

router.post('/exchange', (_req, res) => {
  const response = JSON.stringify({
    status: 'ok',
    message: 'Flow endpoint working',
  })
  const base64Response = Buffer.from(response).toString('base64')

  res.setHeader('Content-Type', 'text/plain')
  res.send(base64Response)
})

router.get('/health', (_req, res) => {
  res.json({ status: 'active' })
})

export default router
