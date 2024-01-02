import { Global, Module } from '@nestjs/common';
import { EndpointStore } from './stores/data-store.service';
import { FileStorage } from './storage/file-storage.service';

@Global()
@Module({
    providers: [
        EndpointStore,
        FileStorage
    ],
    exports: [
        EndpointStore,
        FileStorage
    ]
})
export class DataModule { }
