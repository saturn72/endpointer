import { Module } from '@nestjs/common';
import { EndpointsModule } from './endpoints/endpoints.module';
import { CoreModule } from './core/core.module';
import { ConfigModule } from '@nestjs/config';
import config from 'config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [config]
    }),
    CoreModule,
    EndpointsModule,
  ],
  controllers: [
  ]
})
export class AppModule { }
