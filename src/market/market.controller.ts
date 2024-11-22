// src/market/market.controller.ts
import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { MarketService } from './market.service';
import { GetSignalsDto } from './dto/get-signals.dto';
import { GetDailySignalsDto } from './dto/get-daily-signals.dto';
import { RunBacktestDto } from './dto/run-backtest.dto';

@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('signals')
  getSignals(@Query() query: GetSignalsDto) {
    return this.marketService.getStockData(query.ticker);
  }

  @Get('daily-signals')
  getDailySignals(@Query() query: GetDailySignalsDto) {
    const tickerList = query.tickers.split(',').map((ticker) => ticker.trim().toUpperCase());
    return this.marketService.getDailySignals(tickerList);
  }

  @Get('backtest')
  runBacktest(@Query() query: RunBacktestDto) {
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

    const tickerList = tickers.split(',').map((ticker) => ticker.trim().toUpperCase());
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
