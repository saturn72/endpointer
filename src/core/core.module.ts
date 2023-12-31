import { Global, Module } from '@nestjs/common';
import { InvalidArgumentException } from './InvalidArgumentException';

@Global()
@Module({
    providers:[
        InvalidArgumentException, 
    ],    
})

export class CoreModule {}
