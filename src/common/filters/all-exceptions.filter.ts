import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import type { Response } from 'express'
import { AppError } from '../../middleware/error-handler'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()

    if (res.headersSent) return

    if (exception instanceof AppError) {
      res.status(exception.statusCode).json({
        error: exception.message,
        statusCode: exception.statusCode,
        timestamp: new Date().toISOString(),
      })
      return
    }

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json({
        error: exception.message,
        statusCode: exception.getStatus(),
        timestamp: new Date().toISOString(),
      })
      return
    }

    console.error('Unhandled Error:', exception)
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
      message:
        process.env.NODE_ENV === 'development'
          ? (exception as Error)?.message
          : undefined,
      timestamp: new Date().toISOString(),
    })
  }
}
