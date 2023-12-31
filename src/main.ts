import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { CaseInsensitiveRequestQueryMiddleware } from './core/middleware/case-insensitive-request-query.middleware';

const cirqm = new CaseInsensitiveRequestQueryMiddleware();

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter());

    app.use(cirqm.use);
  await app.listen(3000);
}
bootstrap();
