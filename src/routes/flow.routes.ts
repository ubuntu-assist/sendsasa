import { Router } from 'express'

const router = Router()

router.post('/exchange', (_req, res) => {
  res.json({ status: 'ok', message: 'Flow endpoint working' })
})

router.get('/health', (_req, res) => {
  res.json({ status: 'active' })
})

export default router
