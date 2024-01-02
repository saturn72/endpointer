import { Module } from '@nestjs/common';
import { EndpointsModule } from './endpoints/endpoints.module';
import { CacheModule } from '@nestjs/cache-manager';
import { CoreModule } from './core/core.module';
import { ConfigModule } from '@nestjs/config';
import firebase from 'config/firebase';
import validation from 'config/endpoints';
import { DataModule } from './data/data.module';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [firebase, validation],
      ignoreEnvFile: true,
    }),
    CoreModule,
    DataModule,
    EndpointsModule,
  ],
  providers: [
  ],
})
export class AppModule { }
