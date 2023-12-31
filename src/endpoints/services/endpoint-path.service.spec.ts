import { Test, TestingModule } from '@nestjs/testing';
import {  EndpointPathService } from './endpoint-path.service';

describe('EndpointPathService', () => {
  let service: EndpointPathService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EndpointPathService],
    }).compile();

    service = module.get<EndpointPathService>(EndpointPathService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
