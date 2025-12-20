import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BotModule } from './bot/bot.module';
import { UsersModule } from './modules/users/users.module';
import { MenusModule } from './modules/menus/menus.module';
import { MailModule } from './modules/mail/mail.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { QueueModule } from './modules/queue/queue.module';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { TelegrafModule } from 'nestjs-telegraf';
import { AdminBotService } from './bot/admin-bot.service';
import { SupportBotService } from './bot/support-bot.service';
import { ImagesService } from './modules/images/images.service';
import { ImagesModule } from './modules/images/images.module';
import { SupportBotModule } from './bot/support-bot.module';
import { AdminBotModule } from './bot/admin-bot.module';

@Module({
  // imports: [BotModule, UsersModule, MenusModule, MailModule, TicketsModule, QueueModule],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        synchronize: process.env.NODE_ENV !== 'production',
        autoLoadEntities: true,
      }),
    }),

    // Register ADMIN BOT
    // TelegrafModule.forRootAsync({
    //   botName: 'ADMIN_BOT',
    //   useFactory: () => ({
    //     token: process.env.ADMIN_BOT_TOKEN,
    //   }),
    // }),

    // Register SUPPORT BOT
    // TelegrafModule.forRootAsync({
    //   botName: 'SUPPORT_BOT',
    //   useFactory: () => ({
    //     token: process.env.SUPPORT_BOT_TOKEN,
    //   }),
    // }),

    // SUPPORT BOT (with module for sessions and DI)
    SupportBotModule,
    AdminBotModule,

    BotModule,
    UsersModule,
    MenusModule,
    TicketsModule,
    MailModule,
    QueueModule,
    ImagesModule,
  ],
  // controllers: [AppController],
  providers: [AdminBotService, SupportBotService, ImagesService],
})
export class AppModule {}
