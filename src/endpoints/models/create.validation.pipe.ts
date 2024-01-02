import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import { CreateEndpointModel } from "./create.model";
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateEndpointValidator } from "./create.validator";

@Injectable()
export class CreateEndpointValidationPipe implements PipeTransform<CreateEndpointModel> {

  constructor(private validator: CreateEndpointValidator) { }

  async transform(value: CreateEndpointModel, metadata: ArgumentMetadata) {
    const metatype = metadata.metatype;

    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }
    const object = plainToInstance(metatype, value);
    const modelSchemaErrors = await validate(object);

    if (modelSchemaErrors.length > 0) {
      throw new BadRequestException();
    }

    await this.validator.findErrors(object);
    const functionalErrors = await this.validator.findErrors(object);

    if (functionalErrors) {
      throw new BadRequestException(functionalErrors);
    }

    return value;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}