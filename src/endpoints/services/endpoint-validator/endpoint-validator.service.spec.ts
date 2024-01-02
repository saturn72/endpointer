import { Test, TestingModule } from '@nestjs/testing';
import { EndpointValidator } from './endpoint-validator.service';

describe('EndpointValidatorService', () => {
  let service: EndpointValidator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EndpointValidator],
    }).compile();

    service = module.get<EndpointValidator>(EndpointValidator);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
