import { Global, Module } from '@nestjs/common';
import { EndpointStore } from './stores/endpoint-store.service';
import { FileStorage } from './storage/file-storage.service';
import { Firebase } from './firebase';

@Global()
@Module({
    providers: [
        EndpointStore,
        FileStorage,
        Firebase
    ],
    exports: [
        EndpointStore,
        FileStorage
    ]
})
export class DataModule { }
