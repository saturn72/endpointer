import { Injectable } from '@nestjs/common';
import { PathInfo } from '../dtos/path-info';
import { ConfigService } from '@nestjs/config';
import { FirebaseApp, initializeApp } from "firebase/app";
import { getDownloadURL, getStorage, ref } from "firebase/storage";

@Injectable()
export class EndpointProviderService {
    private readonly app: FirebaseApp;

    constructor(private configService: ConfigService) {
        const firebaseConfig = this.configService.get<any>('firebase');
        const app = initializeApp(firebaseConfig);
    }

    async getEndpointByPath(pathInfo: PathInfo): Promise<string | undefined> {
        return await this.getValetKey(`endpoints\${pathInfo.path}`);
    }

    private async getValetKey(uri: string): Promise<string | undefined> {
        while (uri.startsWith('/')) {
            uri = uri.substring(1);
        }
        uri = uri.replaceAll("  ", " ").replaceAll(' ', '-').toLowerCase();

        try {
            const s = getStorage(this.app);
            const r = ref(s, uri);
            return await getDownloadURL(r);

        } catch (error) {
            console.error(error);
            //log here: ({ data: error });
            return undefined;
        }
    }
}
