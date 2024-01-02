import { ConfigService } from '@nestjs/config';
import { FirebaseApp, initializeApp } from "firebase/app";
import { FirebaseStorage, getDownloadURL, getStorage, ref } from "firebase/storage";
import { Injectable } from '@nestjs/common';

@Injectable()
export class FileStorage {
    private readonly app: FirebaseApp;
    private readonly storage: FirebaseStorage;

    constructor(private configService: ConfigService) {
        const firebaseConfig = this.configService.get<any>('firebase');
        this.app = initializeApp(firebaseConfig);
        this.storage = getStorage(this.app);
    }

    public async getDownloadUrl(uri: string): Promise<string> {
        const r = ref(this.storage, uri);
        return await getDownloadURL(r);
    }
}
