import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus
} from '@nestjs/common'
import { Response } from 'express'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse()
      const payload =
        typeof body === 'object' && body !== null
          ? body
          : { code: status, message: String(body) }
      res.status(status).json(payload)
      return
    }

    console.error(exception)
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 500,
      message: '服务器内部错误'
    })
  }
}
