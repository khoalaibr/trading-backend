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
    const {
      tickers,
      initialAmount,
      startDate,
      endDate,
      interval = '1d',
      strategy = 'indicators',
      tp = '0.05',
      sl = '0.03',
    } = query;

    const tickerList = tickers
      .split(',')
      .map((ticker) => ticker.trim().toUpperCase());
    const amount = parseFloat(initialAmount);
    const takeProfit = parseFloat(tp);
    const stopLoss = parseFloat(sl);

    return this.marketService.runBacktest(
      tickerList,
      amount,
      startDate,
      endDate,
      interval,
      strategy,
      takeProfit,
      stopLoss,
    );
  }
}
