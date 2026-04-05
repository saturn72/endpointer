import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NatsService } from '../nats/nats.service';
import { FeedSnapshotRepository } from './feed-snapshot.repository';
import { VersionPointerRepository } from './version-pointer.repository';
export declare class FeedIngestionSubscriber implements OnModuleInit {
    private natsService;
    private configService;
    private feedSnapshotRepository;
    private versionPointerRepository;
    private readonly logger;
    private s3Client;
    constructor(natsService: NatsService, configService: ConfigService, feedSnapshotRepository: FeedSnapshotRepository, versionPointerRepository: VersionPointerRepository);
    onModuleInit(): Promise<void>;
    private subscribe;
    private handleEvent;
    private parseContent;
}
