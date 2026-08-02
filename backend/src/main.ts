import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true, bodyParser: false });
  const config = app.get(ConfigService);
  const frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3000');

  app.use((req: any, res: any, next: () => void) => {
    const correlationId = req.headers['x-correlation-id'] || randomUUID();
    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    next();
  });
  app.use(cookieParser());
  app.use(json({ limit: config.get<string>('REQUEST_BODY_LIMIT', '1mb'), verify: (req: any, _res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
  app.use(urlencoded({ extended: true, limit: config.get<string>('REQUEST_BODY_LIMIT', '1mb') }));
  app.use(helmet());
  app.enableCors({ origin: [frontendUrl], credentials: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  app.setGlobalPrefix(config.get<string>('API_PREFIX', 'api/v1'));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(Number(config.get('PORT', config.get('API_PORT', 4000))));
}

bootstrap();
