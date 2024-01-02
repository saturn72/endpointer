import { Test, TestingModule } from '@nestjs/testing';
import { CreateEndpointValidator } from './create.validator';

describe('EndpointValidatorService', () => {
  let service: CreateEndpointValidator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CreateEndpointValidator],
    }).compile();

    service = module.get<CreateEndpointValidator>(CreateEndpointValidator);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
