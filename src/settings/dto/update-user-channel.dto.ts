import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserChannelDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;
}
