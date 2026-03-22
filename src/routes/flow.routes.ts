import { Router } from 'express'
import { FlowDataExchangeService } from '../services/flow-data-exchange.service'

const router = Router()

router.post('/flow-data-exchange', async (req, res) => {
  try {
    await FlowDataExchangeService.handleDataExchange(req, res)
  } catch (error) {
    console.error('Flow data exchange route error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
