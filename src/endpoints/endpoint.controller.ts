import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { EndpointService } from './services/endpoint.service';
import { FastifyReply } from 'fastify';
import { MediaType } from './dtos/path-info';

@Controller('endpoint')
export class EndpointController {
  constructor(private readonly epService: EndpointService) { }

  @Get(':owner/:name')
  async getEndpoint(
    @Param('owner') owner: string,
    @Param('name') name: string,
    @Query('version') version: string | undefined,
    @Query('extension') extension: MediaType | undefined
  ): Promise<any> {

    const ep = await this.epService.getEndpoint(owner, name, version, extension);
    if (!ep) {
      throw new NotFoundException();
    }
    return ep;
  }
}
