import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../tickets/ticket.entity/ticket.entity';

@Module({
  // imports: [
    
  // ],
  providers: [MailService],
  exports: [MailService]
})
export class MailModule {}
 