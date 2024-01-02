import { Injectable } from '@nestjs/common';

@Injectable()
export class EndpointStore {
    public getUsernameEndpointNames(username: string): Promise<string[]> {
        throw new Error('Method not implemented.');
    }

}
