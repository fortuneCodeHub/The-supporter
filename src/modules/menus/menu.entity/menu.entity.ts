import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('menus')
export class Menu {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb', default: [] })
  structure: {
    id: string;
    title: string;
    slug: string;
    metadata?: any;
    children: any[];
  }[];

  @CreateDateColumn()
  createdAt: Date;
}
