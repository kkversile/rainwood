import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { correlationId?: string }>();
    const response = ctx.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message = typeof body === 'string' ? body : (body as { message?: string | string[] } | undefined)?.message;
    response.status(status).json({
      statusCode: status,
      error: status >= 500 ? 'Internal Server Error' : 'Request Error',
      message: message ?? (status >= 500 ? 'An unexpected error occurred' : 'Request failed'),
      path: request.originalUrl,
      correlationId: request.correlationId,
      timestamp: new Date().toISOString(),
    });
  }
}
