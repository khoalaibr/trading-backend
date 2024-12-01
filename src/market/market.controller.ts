// src/market/market.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { MarketService } from './market.service';
import { GetSignalsDto } from './dto/get-signals.dto';
import { GetDailySignalsDto } from './dto/get-daily-signals.dto';
import { RunBacktestDto } from './dto/run-backtest.dto';

@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('signals')
  async getSignals(@Query() query: GetSignalsDto) {
    const { ticker } = query;
    const isB3 = ticker.endsWith('.SA'); // Verificar si es una acción de B3
    return this.marketService.getHistoricalData(ticker, isB3);
  }

  @Get('daily-signals')
  async getDailySignals(@Query() query: GetDailySignalsDto) {
    const tickerList = query.tickers
      .split(',')
      .map((ticker) => ticker.trim().toUpperCase());
    return this.marketService.getDailySignals(tickerList);
  }

  @Get('backtest')
  async runBacktest(@Query() query: RunBacktestDto) {
    console.log('Parametros recibidos para el Backtest:', query);
    const {
      tickers,
      range = '1mo',
      interval = '1d',
      strategy = 'indicators',
    } = query;

    const tickerList = tickers
      .split(',')
      .map((ticker) => ticker.trim().toUpperCase());

    return this.marketService.runBacktest(
      tickerList,
      range,
      interval,
      strategy,
    );
  }
}