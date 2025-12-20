import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './ticket.entity/ticket.entity';
import { UsersModule } from '../users/users.module';
import { ImagesModule } from '../images/images.module';
import { QueueModule } from '../queue/queue.module';
// import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket]),
    UsersModule,
    ImagesModule,
    QueueModule,
    // MailModule,
  ],
  providers: [TicketsService],
  exports: [TicketsService]
})
export class TicketsModule {}
