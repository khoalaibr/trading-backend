// src/market/dto/run-backtest.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsNumberString } from 'class-validator';

export class RunBacktestDto {
  @IsString()
  @IsNotEmpty()
  tickers: string;

  @IsNumberString()
  @IsNotEmpty()
  initialAmount: string;

  @IsString()
  @IsNotEmpty()
  startDate: string;

  @IsString()
  @IsNotEmpty()
  endDate: string;

  @IsString()
  @IsOptional()
  interval?: string;

  @IsString()
  @IsOptional()
  strategy?: string;

  @IsNumberString()
  @IsOptional()
  tp?: string;

  @IsNumberString()
  @IsOptional()
  sl?: string;
}
