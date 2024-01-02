import { Test, TestingModule } from '@nestjs/testing';
import { FileStorage } from './file-storage.service';

describe('StorageService', () => {
  let service: FileStorage;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileStorage],
    }).compile();

    service = module.get<FileStorage>(FileStorage);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
