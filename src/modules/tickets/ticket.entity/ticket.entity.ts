import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
// import { User } from 'src/modules/users/users.entity/users.entity';
import { User } from '../../users/users.entity/users.entity';

@Entity('tickets')
export class Ticket {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    type: string;

    @Column()
    tag: string;

    @Column()
    ticketNumber: string;

    // User info
    @Column({ nullable: true })
    fullName?: string;

    @Column({ nullable: true })
    telegramUsername?: string;

    @Column({ nullable: true })
    email?: string;

    // Wallet / blockchain info
    @Column({ nullable: true })
    wallet?: string;

    @Column({ nullable: true })
    chain?: string;

    // Message / description
    @Column({ type: 'text', nullable: true })
    message?: string;

    // Screenshots / documents
    @Column({ type: 'simple-array', nullable: true })
    images?: string[];

    @Column({ type: 'simple-array', nullable: true })
    documents?: string[];

    // Platform / social info
    @Column({ nullable: true })
    discordUsername?: string;

    @Column({ nullable: true })
    username?: string; // For airdrop, leaderboard, mini-app

    @Column({ nullable: true })
    referralId?: string;

    // Collaboration / partnership info
    @Column({ nullable: true })
    projectName?: string;

    @Column({ type: 'text', nullable: true })
    offerDetails?: string;

    @Column({ type: 'simple-array', nullable: true })
    links?: string[];

    @Column({ nullable: true })
    tier?: string;

    // Admin / system metadata
    @Column({ type: 'text', nullable: true })
    note?: string;

    @Column({ nullable: true })
    callLink?: string; // For investor calls

    @Column({ nullable: true })
    scamAlert?: boolean;

    @Column({ nullable: true })
    xpPoints?: number;

    @Column({ default: false })
    status: boolean;

    @Column({ default: false })
    emailed: boolean;

    @Column({ default: false })
    forwardedToGroup: boolean;

    @CreateDateColumn()
    createdAt: Date;

    // RELATION
    @ManyToOne(() => User, (user) => user.tickets, { eager: true })
    // @JoinColumn({ name: 'userId' })
    user: User;

    // Store large IDs safely as string in Postgres BIGINT
    // @Column({
    //     type: 'bigint',
    //     nullable: false,
    //     transformer: {
    //         to: (value: string | number) => value.toString(), // store as string
    //         from: (value: string) => value,                  // retrieve as string
    //     },
    // })
    // userId: string;
}
