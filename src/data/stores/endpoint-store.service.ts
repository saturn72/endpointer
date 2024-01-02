import { Injectable } from '@nestjs/common';
import { Firebase } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

@Injectable()
export class EndpointStore {
    constructor(private firebase: Firebase) { }
    public async getEndpointsByUsername(username: string): Promise<any[]> {
        const col = collection(this.firebase.store, "endpoints");
        const q = query(col, where("username", '==', username));
        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(x => x.data());
    }
}
