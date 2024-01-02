import { IsBoolean, IsString } from "class-validator";

export class CreateEndpointModel {
    @IsString()
    name: string;

    @IsString()
    description: string;

    @IsBoolean()
    isPublicEndpoint: boolean = true;
}

export class CreateEndpointVersionModel {
    @IsString()
    tags: string;
}