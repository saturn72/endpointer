import { Injectable } from '@nestjs/common';
import { EndpointProviderService } from './endpoint-provider.service';
import { EndpointPathService } from './endpoint-path.service';
import { PathInfo } from '../dtos/path-info';

@Injectable()
export class EndpointService {
    constructor(
        private readonly endpointPath:EndpointPathService,
        private readonly endpointProvider:EndpointProviderService){}
        
    async getEndpoint(owner:string, name:string, version:string): Promise<string> {
        const cp = new PathInfo();
        cp.owner = owner;
        cp.name = name;
        cp.version = version || "@latest";

        await this.endpointPath.buildPath(cp);
        return await this.endpointProvider.getEndpointByPath(cp);
    }
}

