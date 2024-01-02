import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hasLiteralValue } from 'src/core/utils';
import { EndpointStore } from 'src/data/stores/endpoint-store.service';
import { CreateEndpoint } from 'src/endpoints/dtos/endpoint.dto';

@Injectable()
export class CreateEndpointValidator {
    private readonly reserveNames: string[];
    private readonly namingConventions: RegExp[];

    constructor(
        private configService: ConfigService,
        private store: EndpointStore) {
        this.reserveNames = this.configService.get<string[]>('endpoints.validation.reserveNames');
        this.namingConventions = this.configService.get<RegExp[]>('endpoints.validation.namingConventions');
    }

    public findErrors(endpoint: CreateEndpoint): Promise<string[] | undefined> {
        return this.createNameRules(endpoint);
    }

    private async createNameRules({ name, username }): Promise<string[] | undefined> {

        if (!hasLiteralValue(name)) {
            return ["endpoint name is required"];
        }

        if (this.reserveNames.includes(name)) {
            return ["invalid endpoint name."];
        }

        if (!this.complyWithNamingConventions(name)) {
            return ["invalid endpoint name. Endpoint name must be at min length of 4 characters and max length of 16, and contain only letters, numbers and hyphens"];
        }

        const exist = await this.endpointNamelreadyExists(username, name);
        if (!exist) {
            return [`an endpoint named ${name} already exist`]
        };
    }
    private complyWithNamingConventions(name: string): boolean {
        for (let index = 0; index < this.namingConventions.length; index++) {
            if (!this.namingConventions[index].test(name)) {
                return false;
            }
        }
        return true;
    }

    private async endpointNamelreadyExists(username: string, name: string): Promise<boolean> {
        const existNames = await this.store.getEndpointsByUsername(username);
        return existNames.includes(name);
    }
}

