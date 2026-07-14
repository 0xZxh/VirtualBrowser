import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus
} from '@nestjs/common'
import { Response } from 'express'

@Catch()
export class CompatExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse()
      if (typeof body === 'object' && body !== null && 'success' in body) {
        res.status(status).json(body)
        return
      }
      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? String((body as { message: unknown }).message)
          : String(body)
      res.status(status).json({ success: false, message })
      return
    }

    console.error('[compat]', exception)
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '服务器内部错误'
    })
  }
}
