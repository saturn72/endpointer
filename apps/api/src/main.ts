import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);
    const port = Number(configService.get<string>('PORT')) || 3001;
    await app.listen(port);
    console.log(`API app listening on port ${port}`);
}

bootstrap();