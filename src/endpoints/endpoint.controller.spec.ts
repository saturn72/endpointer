import { Test, TestingModule } from '@nestjs/testing';
import { EndpointController } from './endpoint.controller';
import { CreateEndpoint } from './dtos/endpoint.dto';
import { CreateEndpointValidator } from './models/create.validator';
import { EndpointService } from './services/endpoint.service';
import { DataModule } from '../data/data.module';

describe('EndpointController', () => {
  let controller: EndpointController;
  let epService: EndpointService;
  let epValidator: CreateEndpointValidator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EndpointController],
      imports: [
        DataModule
      ]
    }).compile();

    epService = module.get<EndpointService>(EndpointService);
    epValidator = module.get<CreateEndpointValidator>(CreateEndpointValidator);
    controller = module.get<EndpointController>(EndpointController);
  });

  // it('should be defined', () => {
  //   expect(controller).toBeDefined();
  // });

  it('should return bad request create endpoint', async () => {
    const result = Promise.resolve({ errors: ["e1", "e2"] });
    jest.spyOn(epValidator, 'validateForCreate').mockImplementation(() => result);

    const e = new CreateEndpoint();
    e.description = "this is endpoint description";
    e.name = "ep-name";
    e.isPublicEndpoint = true;

    const res = await controller.createEndpoint(e);
    expect(res).toBe(404);
  });
});
