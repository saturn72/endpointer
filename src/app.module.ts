import { Module } from '@nestjs/common';
import { EndpointsModule } from './endpoints/endpoints.module';
import { CacheInterceptor, CacheModule } from '@nestjs/cache-manager';
import { CoreModule } from './core/core.module';
import { ConfigModule } from '@nestjs/config';
import config from 'config';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [config]
    }),
    CoreModule,
    EndpointsModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
  ],
})
export class AppModule { }
