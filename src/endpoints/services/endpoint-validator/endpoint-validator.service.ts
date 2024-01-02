import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hasLiteralValue } from 'src/core/utils';
import { EndpointStore } from 'src/data/stores/data-store.service';
import { CreateEndpoint, ValidationResponse } from 'src/endpoints/dtos/endpoint.dto';

@Injectable()
export class EndpointValidator {
    private readonly reserveNames: string[];
    private readonly namingConventions: RegExp[];

    constructor(
        private configService: ConfigService,
        private store: EndpointStore) {
        this.reserveNames = this.configService.get<string[]>('endpoints.validation.reserveNames');
        this.namingConventions = this.configService.get<RegExp[]>('endpoints.validation.namingConventions');
    }

    public validateForCreate(endpoint: CreateEndpoint): Promise<ValidationResponse> {
        return this.createNameRules(endpoint);
    }

    private async createNameRules({ name, username }): Promise<ValidationResponse> {

        if (!hasLiteralValue(name)) {
            return { errors: ["endpoint name is required"] };
        }

        if (this.reserveNames.includes(name)) {
            return { errors: ["invalid endpoint name."] };
        }

        if (!this.complyWithNamingConventions(name)) {
            return { errors: ["invalid endpoint name. Endpoint name must be at min length of 4 characters and max length of 16, and contain only letters, numbers and hyphens"] };
        }

        const exist = await this.endpointNamelreadyExists(username, name);
        if (!exist) {
            return { errors: [`an endpoint named ${name} already exist`] };
        }
        return { success: true };
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
        const existNames = await this.store.getUsernameEndpointNames(username);
        return existNames.includes(name);
    }
}

