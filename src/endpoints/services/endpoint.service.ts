import { Inject, Injectable } from '@nestjs/common';
import { EndpointProviderService } from './endpoint-provider.service';
import { EndpointPathService } from './endpoint-path.service';
import { MediaType, PathInfo } from '../dtos/path-info';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class EndpointService {
    private static readonly ttl: number = 24 * 60 * 60 * 1000; // one day
    constructor(
        private readonly endpointPath: EndpointPathService,
        private readonly endpointProvider: EndpointProviderService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache) { }

    async getEndpoint(owner: string, name: string, version: string, mediaType: MediaType): Promise<string> {
        const pi = new PathInfo();
        pi.owner = owner;
        pi.name = name;
        pi.mediaType = mediaType || 'json';
        pi.version = version || "@latest";

        await this.endpointPath.buildPath(pi);
        let ep = await this.cacheManager.get<string>(pi.path);
        if (!ep) {
            ep = await this.endpointProvider.getEndpointByPath(pi);
            if (ep) {
                await this.cacheManager.set(pi.path, ep, EndpointService.ttl);
            }
        }

        return ep;
    }
}

