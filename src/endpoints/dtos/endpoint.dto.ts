export class CreateEndpoint {
    name: string;
    description: string;
    isPublicEndpoint: boolean;
    username: string;
}

export type ValidationResponse = { success?: boolean, errors?: string[] };