import { Test, TestingModule } from '@nestjs/testing';
import { EndpointProviderService } from './endpoint-provider.service';

describe('EndpointProviderService', () => {
  let service: EndpointProviderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EndpointProviderService],
    }).compile();

    service = module.get<EndpointProviderService>(EndpointProviderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
