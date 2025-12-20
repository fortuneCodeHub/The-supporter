import { IsOptional, IsString } from "class-validator";

export class CreateTicketDto {
    @IsString()
    type: string;

    @IsString()
    tag: string;

    @IsString()
    message: string;

    @IsString()
    ticketNumber: string;

    @IsOptional()
    @IsString()
    wallet?: string;
}