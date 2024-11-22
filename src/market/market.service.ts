// src/market/market.service.ts

import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import yahooFinance from 'yahoo-finance2';
import { IndicatorsStrategy } from './strategies/indicators.strategy';
import { LongShortStrategy } from './strategies/long-short.strategy';

@Injectable()
export class MarketService {
  // Obtener señales diarias para múltiples tickers
  async getDailySignals(tickers: string[]): Promise<any[]> {
    const results = [];

    for (const ticker of tickers) {
      try {
        const historicalData = await this.getHistoricalData(
          ticker,
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Últimos 30 días
          new Date().toISOString(),
          '1d',
        );

        if (!historicalData || historicalData.length < 20) {
          results.push({ ticker, message: 'Insufficient data for analysis.' });
          continue;
        }

        const quoteData = await yahooFinance.quote(ticker);
        const currentPrice = quoteData.regularMarketPrice;
        const currentDate = new Date().toISOString();

        const slicedData = [currentPrice, ...historicalData.map((d) => d.price)];
        const signals = IndicatorsStrategy.analyzeSignals(slicedData);

        results.push({
          ticker,
          buy: signals.buy,
          sell: signals.sell,
          currentPrice,
          lastDate: currentDate,
        });
      } catch (error) {
        results.push({
          ticker,
          message: `Error fetching data for ${ticker}: ${error.message}`,
        });
      }
    }

    return results;
  }

  // Obtener datos de una acción específica
  async getStockData(ticker: string): Promise<any> {
    try {
      const data = await yahooFinance.quote(ticker);
      return {
        ticker: data.symbol,
        price: data.regularMarketPrice,
        change: data.regularMarketChange,
        changePercent: data.regularMarketChangePercent,
      };
    } catch (error) {
      throw new HttpException(
        `Error fetching stock data for ${ticker}: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Obtener datos históricos de un ticker
  async getHistoricalData(ticker: string, startDate: string, endDate: string, interval: string): Promise<any[]> {
    const validIntervals: Array<'1d' | '1wk' | '1mo'> = ['1d', '1wk', '1mo'];

    if (!validIntervals.includes(interval as '1d' | '1wk' | '1mo')) {
      throw new HttpException(
        `Invalid interval. Valid intervals are: ${validIntervals.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const data = await yahooFinance.historical(ticker, {
        period1: new Date(startDate),
        period2: new Date(endDate),
        interval: interval as '1d' | '1wk' | '1mo',
      });

      if (!data || data.length === 0) {
        throw new Error(`No historical data available for ${ticker}`);
      }

      return data.map((item) => ({
        date: item.date,
        price: item.close,
      }));
    } catch (error) {
      throw new HttpException(
        `Error fetching historical data for ${ticker}: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Realizar backtest con diferentes estrategias
  async runBacktest(
    tickers: string[],
    initialAmount: number,
    startDate: string,
    endDate: string,
    interval: string,
    strategy: string,
    takeProfit: number,
    stopLoss: number,
  ): Promise<any[]> {
    const results = [];

    for (const ticker of tickers) {
      const historicalData = await this.getHistoricalData(ticker, startDate, endDate, interval);

      let balance = initialAmount;
      let openPosition = null;
      const operations = [];

      for (let i = 0; i < historicalData.length; i++) {
        const { price, date } = historicalData[i];
        const slicedData = historicalData.slice(i).map((d) => d.price);

        let signals;
        if (strategy === 'indicators') {
          signals = IndicatorsStrategy.analyzeSignals(slicedData);
        } else if (strategy === 'long_short') {
          signals = LongShortStrategy.analyzeSignals(slicedData);
        } else {
          signals = { buy: false, sell: false };
        }

        if (!openPosition && signals.buy) {
          const shares = Math.floor(balance / price);
          openPosition = { type: 'buy', price, date, shares };
        } else if (openPosition) {
          const currentProfit = (price - openPosition.price) / openPosition.price;

          if (
            (strategy === 'tp_sl' && (currentProfit >= takeProfit || currentProfit <= -stopLoss)) ||
            (strategy === 'indicators' && signals.sell)
          ) {
            const profit = (price - openPosition.price) * openPosition.shares;
            balance += profit;
            operations.push({
              type: 'sell',
              openDate: openPosition.date,
              closeDate: date,
              entryPrice: openPosition.price,
              exitPrice: price,
              shares: openPosition.shares,
              profit,
            });
            openPosition = null;
          }
        }
      }

      const totalProfit = operations.reduce((acc, op) => acc + op.profit, 0);

      results.push({
        ticker,
        initialAmount,
        finalAmount: balance.toFixed(2),
        totalOperations: operations.length,
        totalProfit: totalProfit.toFixed(2),
        successfulOperations: operations.filter((op) => op.profit > 0).length,
        successRate: ((operations.filter((op) => op.profit > 0).length / operations.length) * 100).toFixed(2),
        operations,
      });
    }

    return results;
  }
}
