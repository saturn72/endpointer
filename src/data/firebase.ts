import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FirebaseApp, initializeApp } from "firebase/app";
import { FirebaseStorage, getStorage } from "firebase/storage";
import { Firestore, getFirestore } from "firebase/firestore";

@Injectable()
export class Firebase {
    private _app: FirebaseApp;
    private _storage: FirebaseStorage;
    private _store: Firestore;

    private readonly firebaseConfig: any;

    private get app() {
        return this._app ??= initializeApp(this.firebaseConfig);
    }

    get storage() {
        return this._storage ??= getStorage(this.app);
    }

    get store() {
        return this._store ??= getFirestore(this.app);
    }

    constructor(private configService: ConfigService) {
        this.firebaseConfig = this.configService.get<any>('firebase');
    }
}