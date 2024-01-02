import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { CaseInsensitiveRequestQueryMiddleware } from './core/middleware/case-insensitive-request-query.middleware';
import { ValidationPipe } from '@nestjs/common';

const cirqm = new CaseInsensitiveRequestQueryMiddleware();

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );
  app.use(cirqm.use);
  await app.listen(3000);
}
bootstrap();
