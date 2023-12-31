import { Injectable } from '@nestjs/common';
import { PathInfo } from '../dtos/path-info.js';

@Injectable()
export class EndpointProviderService {
    async getEndpointByPath(cp: PathInfo): Promise<any> {
        return cp;
    }
}
