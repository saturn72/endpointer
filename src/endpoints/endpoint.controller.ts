import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import { EndpointService } from './services/endpoint.service';
import { FastifyReply } from 'fastify';
import { MediaType, PathInfo, mediaTypeToContentType } from './dtos/path-info';
import { CreateEndpoint as Endpoint } from './dtos/endpoint.dto';
import { CreateEndpointValidator } from './models/create.validator';
import { CreateEndpointModel } from './models/create.model';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { EndpointCaching } from './services/endpoint-caching';
import { CreateEndpointValidationPipe } from './models/create.validation.pipe';

@Controller('endpoint')
export class EndpointController {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly endpointValidator: CreateEndpointValidator,
    private readonly endpointService: EndpointService,
  ) { }

  @Get(':owner/:name')
  async getEndpointByPath(
    @Param('owner') owner: string,
    @Param('name') name: string,
    @Query('version') version: string | undefined = '@latest',
    @Query('contenttype') contentType: MediaType | undefined = 'json',
    @Res() response: FastifyReply
  ): Promise<void> {

    const pathInfo = new PathInfo();
    pathInfo.owner = owner;
    pathInfo.name = name;
    pathInfo.mediaType = contentType;
    pathInfo.version = version;

    let ep = await this.cacheManager.get<string>(pathInfo.path);
    if (!ep) {
      ep = await this.endpointService.getEndpoint(pathInfo);
      if (ep) {
        await this.cacheManager.set(pathInfo.path, ep, EndpointCaching.ttl);
      }
    }
    if (!ep) {
      throw new NotFoundException();
    }

    response.type(mediaTypeToContentType(contentType));
    response.send(ep);
  }

  @Post()
  async createEndpoint(@Body(CreateEndpointValidationPipe) endpoint: CreateEndpointModel): Promise<any> {

    const e = new Endpoint();
    e.description = endpoint.description;
    e.isPublicEndpoint = endpoint.isPublicEndpoint;
    e.name = endpoint.name.trim();
    e.username = "get owner name from JWT";



    throw new Error("not implemented yet...")
  }

  // @Post()
  // async createEndpointVersion(endpointVersion: CreateEndpoint): Promise<any> {

  //   throw new Error("not implemented yet...")
  // }
}
