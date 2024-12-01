// src/market/dto/run-backtest.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsNumberString } from 'class-validator';

export class RunBacktestDto {
  @IsString()
  @IsNotEmpty()
  tickers: string;

  @IsString()
  @IsOptional()
  interval?: string;

  @IsString()
  @IsOptional()
  range?: string; 

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
