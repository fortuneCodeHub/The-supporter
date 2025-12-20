import { Module } from '@nestjs/common';
import { MenusService } from './menus.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Menu } from './menu.entity/menu.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Menu])
  ],
  providers: [MenusService],
  exports: [MenusService]
})
export class MenusModule {}
