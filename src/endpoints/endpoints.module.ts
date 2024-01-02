import { Module } from '@nestjs/common';
import { EndpointController } from './endpoint.controller';
import { EndpointService } from './services/endpoint.service';
import { EndpointValidator } from './services/endpoint-validator/endpoint-validator.service';


@Module({
    imports: [],
    controllers: [EndpointController],
    providers: [
        EndpointService,
        EndpointValidator,
    ]
})
export class EndpointsModule { } 
