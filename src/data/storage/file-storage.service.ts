import { getDownloadURL, ref } from "firebase/storage";
import { Injectable } from '@nestjs/common';
import { Firebase } from '../firebase';

@Injectable()
export class FileStorage {
    constructor(private firebase: Firebase) {
    }

    public async getDownloadUrl(uri: string): Promise<string> {
        const r = ref(this.firebase.storage, uri);
        return await getDownloadURL(r);
    }
}
