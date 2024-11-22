// src/market/dto/get-signals.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class GetSignalsDto {
  @IsString()
  @IsNotEmpty()
  ticker: string;
}
