import { Controller, Get, Param, Query } from '@nestjs/common';
import { EndpointService } from './services/endpoint.service';

@Controller('endpoint')
export class EndpointController {
    constructor(private readonly epService: EndpointService) {}

    @Get(':owner/:name')
    async getEndpoint(
      @Param('owner') owner: string,
      @Param('name') name: string,
      @Query('version') version: string|undefined,
    ): Promise<string> {

      return await this.epService.getEndpoint(owner, name, version);
    }
}
