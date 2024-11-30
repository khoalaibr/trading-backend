// src/market/market.service.ts

import { Injectable } from '@nestjs/common';
import axios from 'axios';
import yahooFinance from 'yahoo-finance2';
import { IndicatorsStrategy } from './strategies/indicators.strategy';
import { LongShortStrategy } from './strategies/long-short.strategy';

type Interval = '1d' | '1wk' | '1mo';

@Injectable()
export class MarketService {
  constructor() {
    // Supresión opcional de logs
    // yahooFinance.options.logger = () => {};
  }

  async getHistoricalData(ticker: string, isB3: boolean): Promise<any> {
    if (isB3) {
      return await this.getHistoricalDataFromBrapi(ticker);
    } else {
      return await this.getHistoricalDataFromYahoo(
        ticker,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Últimos 30 días
        new Date(),
        '1d',
      );
    }
  }

  async getDailySignals(tickers: string[]): Promise<any[]> {
    const results = [];

    for (const ticker of tickers) {
      try {
        const isB3 = ticker.endsWith('.SA');

        const { historicalData, currentPrice, lastDate } = isB3
          ? await this.getHistoricalDataFromBrapi(ticker)
          : await this.getHistoricalDataFromYahoo(
              ticker,
              new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Últimos 30 días
              new Date(),
              '1d',
            );

        if (!historicalData || historicalData.length < 20) {
          results.push({
            ticker,
            message: isB3
              ? 'BRAPI puede tener datos limitados para esta acción brasileña.'
              : 'Datos insuficientes para el análisis.',
          });
          continue;
        }

        const prices = historicalData.map((d) => d.price);
        const slicedData = [currentPrice, ...prices];

        const signals = IndicatorsStrategy.analyzeSignals(slicedData);

        results.push({
          ticker,
          buy: signals.buy,
          sell: signals.sell,
          currentPrice,
          lastDate,
        });
      } catch (error) {
        results.push({
          ticker,
          message: `Error al obtener datos para ${ticker}: ${error.message}`,
        });
      }
    }

    return results;
  }

  async getHistoricalDataFromBrapi(ticker: string): Promise<any> {
    const url = `https://brapi.dev/api/quote/${ticker}`;
    try {
      const response = await axios.get(url, {
        params: {
          range: '1mo',
          interval: '1d',
          fundamental: 'false',
          token: process.env.BRAPI_TOKEN,
        },
      });

      const data = response.data;

      if (!data || !data.results || data.results.length === 0) {
        throw new Error(`No hay datos disponibles para ${ticker} en BRAPI.`);
      }

      const quotes = data.results[0].historicalDataPrice;
      if (!quotes || quotes.length === 0) {
        throw new Error(
          `No hay datos históricos disponibles para ${ticker} en BRAPI.`,
        );
      }

      const historicalData = quotes
        .map((quote) => ({
          date: new Date(quote.date),
          price: quote.close,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime()); // Orden ascendente

      const currentPrice = data.results[0].regularMarketPrice;
      const lastDate = data.results[0].regularMarketTime
        ? new Date(data.results[0].regularMarketTime)
        : new Date();

      return {
        historicalData,
        currentPrice,
        lastDate,
      };
    } catch (error) {
      if (error.response) {
        console.error('Data:', error.response.data);
        console.error('Status:', error.response.status);
        console.error('Headers:', error.response.headers);
      } else if (error.request) {
        console.error('Request:', error.request);
      } else {
        console.error('Error Message:', error.message);
      }
      throw new Error(
        `Error al obtener datos históricos para ${ticker} de BRAPI: ${error.message}`,
      );
    }
  }

  async getHistoricalDataFromYahoo(
    ticker: string,
    startDate: Date,
    endDate: Date,
    interval: Interval,
  ): Promise<any> {
    try {
      const data = await yahooFinance.historical(ticker, {
        period1: startDate,
        period2: endDate,
        interval,
      });

      if (!data || data.length === 0) {
        throw new Error(
          `No hay datos históricos disponibles para ${ticker} en Yahoo Finance.`,
        );
      }

      const historicalData = data
        .map((item) => ({
          date: item.date,
          price: item.close,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime()); // Orden ascendente

      const currentPrice = data[data.length - 1].close;
      const lastDate = data[data.length - 1].date;

      return {
        historicalData,
        currentPrice,
        lastDate,
      };
    } catch (error) {
      throw new Error(
        `Error al obtener datos históricos para ${ticker} de Yahoo Finance: ${error.message}`,
      );
    }
  }

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
    const validIntervals: Interval[] = ['1d', '1wk', '1mo'];
    if (!validIntervals.includes(interval as Interval)) {
      throw new Error(
        `Intervalo inválido: ${interval}. Los intervalos válidos son: ${validIntervals.join(', ')}`,
      );
    }
    const intervalCasted = interval as Interval;
  
    for (const ticker of tickers) {
      const isB3 = ticker.endsWith('.SA');
  
      const { historicalData } = isB3
        ? await this.getHistoricalDataFromBrapi(ticker)
        : await this.getHistoricalDataFromYahoo(
            ticker,
            new Date(startDate),
            new Date(endDate),
            intervalCasted,
          );
  
      console.log(`Ticker: ${ticker}, Historical Data Points: ${historicalData.length}`);
  
      if (!historicalData || historicalData.length === 0) {
        results.push({
          ticker,
          message: 'Datos insuficientes para el backtest.',
        });
        continue;
      }
  
      let balance = initialAmount;
      let openPosition = null;
      const operations = [];
  
      for (let i = 0; i < historicalData.length; i++) {
        const { price, date } = historicalData[i];
        const slicedData = historicalData.slice(0, i + 1).map((d) => d.price);
  
        let signals;
        if (strategy === 'indicators') {
          signals = IndicatorsStrategy.analyzeSignals(slicedData);
        } else if (strategy === 'long_short') {
          signals = LongShortStrategy.analyzeSignals(slicedData);
        } else {
          signals = { buy: false, sell: false };
        }
  
        console.log(`Date: ${date}, Price: ${price}, Buy: ${signals.buy}, Sell: ${signals.sell}`);
  
        if (!openPosition && signals.buy) {
          const shares = Math.floor(balance / price);
          if (shares > 0) {
            openPosition = { type: 'buy', price, date, shares };
            balance -= shares * price;
          }
        } else if (openPosition && signals.sell) {
          const profit = (price - openPosition.price) * openPosition.shares;
          balance += openPosition.shares * price;
          operations.push({
            type: 'trade',
            openDate: openPosition.date,
            closeDate: date,
            entryPrice: openPosition.price,
            exitPrice: price,
            shares: openPosition.shares,
            profit: profit.toFixed(2),
            percentageChange: (((price - openPosition.price) / openPosition.price) * 100).toFixed(2),
            holdingPeriod: Math.ceil(
              (date.getTime() - openPosition.date.getTime()) / (1000 * 60 * 60 * 24),
            ),
          });
          openPosition = null;
        }
      }
  
      if (openPosition) {
        const lastPrice = historicalData[historicalData.length - 1].price;
        const lastDate = historicalData[historicalData.length - 1].date;
        const profit = (lastPrice - openPosition.price) * openPosition.shares;
        operations.push({
          type: 'open',
          openDate: openPosition.date,
          closeDate: lastDate,
          entryPrice: openPosition.price,
          exitPrice: lastPrice,
          shares: openPosition.shares,
          profit: profit.toFixed(2),
          percentageChange: (((lastPrice - openPosition.price) / openPosition.price) * 100).toFixed(2),
          holdingPeriod: Math.ceil(
            (lastDate.getTime() - openPosition.date.getTime()) / (1000 * 60 * 60 * 24),
          ),
        });
        balance += openPosition.shares * lastPrice;
        openPosition = null;
      }
  
      const totalProfit = balance - initialAmount;
      const successfulTrades = operations.filter(
        (op) => op.type === 'trade' && parseFloat(op.percentageChange) > 0,
      ).length;
      const totalTrades = operations.filter((op) => op.type === 'trade').length;
      const successRate =
        totalTrades > 0 ? ((successfulTrades / totalTrades) * 100).toFixed(2) : '0.00';
  
      results.push({
        ticker,
        totalProfit: totalProfit.toFixed(2),
        totalProfitPercentage: ((totalProfit / initialAmount) * 100).toFixed(2),
        totalOperations: totalTrades,
        successRate,
        operations,
      });
    }
  
    return results;
  }
  
}
