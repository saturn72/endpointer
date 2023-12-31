import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class CaseInsensitiveRequestQueryMiddleware implements NestMiddleware {
  use(req: FastifyRequest, res: FastifyReply['raw'], next: () => void) {
    for (const key in (req.query as any)) {
        req.query[key.toLocaleLowerCase()] = req.query[key];
    }

    next();
  }
}
