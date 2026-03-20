import { Router } from 'express'
import { cronResponse } from '../controllers/cron.controller'

const router = Router()

router.get('/activate', cronResponse)

export default router
