import { Test, TestingModule } from '@nestjs/testing';
import { EndpointStore } from './endpoint-store.service';

describe('StoreService', () => {
  let service: EndpointStore;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EndpointStore],
    }).compile();

    service = module.get<EndpointStore>(EndpointStore);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
