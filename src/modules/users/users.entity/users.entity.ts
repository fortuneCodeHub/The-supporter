import { Ticket } from '../../tickets/ticket.entity/ticket.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true, type: 'bigint' })
    telegramId: string;  // IMPORTANT: bigint must be stored as string in TypeORM

    @Column({ nullable: true })
    username?: string;

    @Column({ nullable: true })
    firstName?: string;

    @Column({ default: false })
    isAdmin: boolean;

    @Column({ nullable: true })
    lastName?: string;

    @Column({ type: 'jsonb', nullable: true })
    rawPayload?: any;

    @CreateDateColumn()
    createdAt: Date;

    // Relation
    @OneToMany(() => Ticket, ticket => ticket.user)
    tickets: Ticket[];
}
