// src/market/dto/get-daily-signals.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class GetDailySignalsDto {
  @IsString()
  @IsNotEmpty()
  tickers: string;
}
