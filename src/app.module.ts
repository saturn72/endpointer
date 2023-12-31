import { Module } from '@nestjs/common';
import { EndpointsModule } from './endpoints/endpoints.module';
import { CoreModule } from './core/core.module';

@Module({
  imports: [
    CoreModule,
    EndpointsModule,
    ],
    controllers:[
    ]
})
export class AppModule {}
