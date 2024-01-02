import { Module } from '@nestjs/common';
import { EndpointController } from './endpoint.controller';
import { EndpointService } from './services/endpoint.service';
import { CreateEndpointValidator } from './models/create.validator';


@Module({
    imports: [],
    controllers: [EndpointController],
    providers: [
        EndpointService,
        CreateEndpointValidator,
    ]
})
export class EndpointsModule { } 
