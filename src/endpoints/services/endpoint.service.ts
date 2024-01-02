import { Injectable } from '@nestjs/common';
import { PathInfo } from '../dtos/path-info';
import { FileStorage } from 'src/data/storage/file-storage.service';

@Injectable()
export class EndpointService {
    constructor(
        private readonly storage: FileStorage) { }

    async getEndpoint(pathInfo: PathInfo): Promise<string> {
        const vk = await this.getValetKey(`endpoints/${pathInfo.path}`);
        if (!vk) {
            return undefined;
        }

        const res = await fetch(vk);
        return res.status == 200 ? res.text() : undefined;
    }

    private async getValetKey(uri: string): Promise<string | undefined> {
        while (uri.startsWith('/')) {
            uri = uri.substring(1);
        }
        uri = uri.replaceAll("  ", " ").replaceAll(' ', '-').toLowerCase();

        try {
            return await this.storage.getDownloadUrl(uri);
        } catch (error) {
            console.error(error);
            //log here: ({ data: error });
            return undefined;
        }
    }
}

