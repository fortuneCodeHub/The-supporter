import { Module } from '@nestjs/common';
import { AdminBotModule } from './admin-bot.module';
import { SupportBotModule } from './support-bot.module';

@Module({
  imports: [AdminBotModule, SupportBotModule]
})
export class BotModule {}
