import { Injectable } from '@nestjs/common';
import { PathInfo } from '../dtos/path-info';
import { InvalidArgumentException } from 'src/core/InvalidArgumentException';

@Injectable()
export class EndpointPathService {
    async buildPath(pathInfo: PathInfo): Promise<void> {
        if (!pathInfo || pathInfo == null) {
            throw new InvalidArgumentException("pathInfo.name");
        }

        pathInfo.path = `${pathInfo.owner}/${pathInfo.name}/${pathInfo.version}/data.${pathInfo.mediaType}`;
    }
}
