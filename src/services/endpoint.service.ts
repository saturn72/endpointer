import { Injectable } from '@nestjs/common';

@Injectable()
export class EndpointService {
    async getEndpoint(owner:string, name:string, version:string): Promise<string> {
        return `${owner}/${name}/${version}`;
    }
}
