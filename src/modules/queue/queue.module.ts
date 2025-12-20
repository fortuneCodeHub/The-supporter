import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueService } from './queue.service';

@Module({
  imports: [
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL },
    }),
    BullModule.registerQueue({
      name: 'tickets',
    }),
  ],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}

