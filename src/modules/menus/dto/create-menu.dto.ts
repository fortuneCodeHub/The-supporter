import { IsOptional, IsString } from 'class-validator';

export class CreateMenuDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  parentTitle?: string; // optional: if null → root

  // @IsOptional()
  // metadata?: any; // optional: if null → root
}
