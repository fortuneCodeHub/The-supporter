import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { AdminBotService } from './admin-bot.service';
import { UsersModule } from 'src/modules/users/users.module';
import { MenusModule } from 'src/modules/menus/menus.module';
import { TicketsModule } from 'src/modules/tickets/tickets.module';
import { ImagesModule } from 'src/modules/images/images.module';

@Module({
    imports: [
        UsersModule,
        MenusModule,
        TicketsModule,
        ImagesModule,
        TelegrafModule.forRootAsync({
            botName: 'ADMIN_BOT',
            useFactory: () => {
                const isProduction = process.env.NODE_ENV === "production"
                return {
                    token: process.env.ADMIN_BOT_TOKEN,

                    ...(isProduction ? 
                        {
                            // webhook config for production
                            launchOptions: {
                                webhook: {
                                    domain: process.env.WEBHOOK_DOMAIN, // e.g. https://yourdomain.com
                                    hookPath: `/webhook/admin`,
                                },
                            },
                        } 
                        :
                        {
                            // polling for development
                            launchOptions: { polling: true },
                        }
                    )
                }
            },
        }),
    ],
    providers: [AdminBotService],
    exports: [AdminBotService],
  })

export class AdminBotModule {}
  
