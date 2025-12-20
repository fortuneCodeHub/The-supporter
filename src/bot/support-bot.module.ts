// import { Module } from '@nestjs/common';
// import { TelegrafModule } from 'nestjs-telegraf';
// import { SupportBotService } from './support-bot.service';
// import { MenusModule } from 'src/modules/menus/menus.module';
// import { TicketsModule } from 'src/modules/tickets/tickets.module';

// import { session } from '@telegraf/session';
// import { createClient } from 'redis';
// import { UsersService } from 'src/modules/users/users.service';
// import { ImagesService } from 'src/modules/images/images.service';

// @Module({
//   imports: [
//     MenusModule,
//     TicketsModule,
//     UsersService,
//     ImagesService,

//     TelegrafModule.forRootAsync({
//       useFactory: async () => {
//         // Create Redis client
//         const redis = createClient({
//           url: process.env.REDIS_URL || 'redis://localhost:6379',
//         });

//         redis.on('error', (err) =>
//           console.error('❌ Redis Error:', err),
//         );

//         await redis.connect();

//         // Create a Redis session store
//         const store = RedisStore({
//           client: redis,
//           ttl: 60 * 60 * 24 * 7, // 7 days
//         });

//         return {
//           token: process.env.SUPPORT_BOT_TOKEN,
//           middlewares: [
//             session({ store }), // <--- The ACTUAL working session middleware
//           ],
//           include: [SupportBotService],
//         };
//       },
//     }),
//   ],
//   providers: [SupportBotService],
// })
// export class SupportBotModule {}
import { Module, Global } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import Redis from 'ioredis';
import { session } from 'telegraf';
import { SupportBotService } from './support-bot.service';
import { UsersModule } from 'src/modules/users/users.module';
import { MenusModule } from 'src/modules/menus/menus.module';
import { TicketsModule } from 'src/modules/tickets/tickets.module';
import { ImagesModule } from 'src/modules/images/images.module';
import { MailModule } from 'src/modules/mail/mail.module';

@Global()
@Module({
  imports: [
    UsersModule,
    MenusModule,
    TicketsModule,
    ImagesModule,
    MailModule,
    TelegrafModule.forRootAsync({
        botName: 'SUPPORT_BOT',
        useFactory: () => {
            const redis = new Redis({
                host: process.env.REDIS_HOST || '127.0.0.1',
                port: Number(process.env.REDIS_PORT || 6379),
                password: process.env.REDIS_PASSWORD || undefined,
            });

            const isProduction = process.env.NODE_ENV === "production"

            return {
                token: process.env.SUPPORT_BOT_TOKEN,

                ...(isProduction ? 
                    {
                        // webhook config for production
                        launchOptions: {
                            webhook: {
                                domain: process.env.WEBHOOK_DOMAIN, // e.g. https://yourdomain.com
                                hookPath: `/webhook/support`,
                            },
                        },
                    } 
                    :
                    {
                        // polling for development
                        launchOptions: { polling: true },
                    }
                ),

            //   middlewares: [
            //     session({
            //       getSessionKey: (ctx) => `tg:${ctx.from?.id}`,
            //       storage: {
            //         async get(key) {
            //           const data = await redis.get(key);
            //           return data ? JSON.parse(data) : {};
            //         },
            //         async set(key, value) {
            //           await redis.set(key, JSON.stringify(value));
            //         },
            //         async delete(key) {
            //           await redis.del(key);
            //         },
            //       },
            //     }),
            //   ],

                middlewares: [
                    session({
                        getSessionKey: (ctx) => `tg:${ctx.from?.id}`,
                        store: {
                            async get(key) {
                                const data = await redis.get(key);
                                return data ? JSON.parse(data) : {};
                            },
                            async set(key, value) {
                                await redis.set(key, JSON.stringify(value));
                            },
                            async delete(key) {
                                await redis.del(key);
                            },
                        },
                    }),
                ],
            
            };
        },
    }),
  ],
  providers: [SupportBotService],
  exports: [SupportBotService],
})
export class SupportBotModule {}


