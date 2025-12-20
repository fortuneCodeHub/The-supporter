import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './users.entity/users.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User) 
        private readonly userRepository: Repository<User>

    ) {}

    // Upsert user when they interact with the bot
    async upsertFromTelegram(userDataFromTelegram: any): Promise<User> {
        const telegramId = userDataFromTelegram.id;
        let user = await this.userRepository.findOne({ where: { telegramId } });

        if (user) {
            user.username = userDataFromTelegram.username;
            user.firstName = userDataFromTelegram.first_name;
            user.lastName = userDataFromTelegram.last_name;
            user.rawPayload = userDataFromTelegram;
            return this.userRepository.save(user);
        }

        const newUser: CreateUserDto = {
            telegramId,
            username: userDataFromTelegram.username,
            firstName: userDataFromTelegram.first_name,
            lastName: userDataFromTelegram.last_name,
            rawPayload: userDataFromTelegram,
        };

        user = this.userRepository.create(newUser);

        return this.userRepository.save(user); 
    }

    // Optional: Find user by telegramId
    async findByTelegramId(telegramId: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { telegramId } });
    }

    async findAll() {
        return this.userRepository.find();
    }

    async save(user: User): Promise<User>  {
        return this.userRepository.save(user)
    }

    async updateUser(telegramId: string, updateData: Partial<User>): Promise<User> {
        const user = await this.findByTelegramId(telegramId);
        if (!user) throw new NotFoundException('User not found');
    
        Object.assign(user, updateData); // merge new fields
        return this.userRepository.save(user); // persist
    }
}
