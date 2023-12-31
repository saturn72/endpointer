import { Module } from '@nestjs/common';
import { EndpointController } from './endpoint.controller';
import { EndpointService } from './services/endpoint.service';
import { EndpointPathService } from './services/endpoint-path.service';
import { EndpointProviderService } from './services/endpoint-provider.service';


@Module({
    imports: [],
    controllers: [EndpointController],
    providers: [
        EndpointPathService,
        EndpointProviderService,
        EndpointService,
    ]
})
export class EndpointsModule {} 
