import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue('tickets')
    private readonly ticketsQueue: Queue,
  ) {}

  async sendTicketToQueue(ticketId: string) {
    return this.ticketsQueue.add('sendTicket', { ticketId });
  }
}
