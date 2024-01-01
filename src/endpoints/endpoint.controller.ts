import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { EndpointService } from './services/endpoint.service';

@Controller('endpoint')
export class EndpointController {
  constructor(private readonly epService: EndpointService) { }

  @Get(':owner/:name')
  async getEndpoint(
    @Param('owner') owner: string,
    @Param('name') name: string,
    @Query('version') version: string | undefined
  ): Promise<string> {

    const ep = await this.epService.getEndpoint(owner, name, version);
    if (!ep) {
      throw new NotFoundException();
    }
    return ep;
  }
}
