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
      // Opcional: imprimir la URL y los parámetros para depuración
      console.log('Solicitando a BRAPI con URL:', url);
      console.log('Parámetros:', {
        range: '1mo',
        interval: '1d',
        fundamental: 'false',
        token: process.env.BRAPI_TOKEN, // Cambiado 'apikey' a 'token'
      });
  
      const response = await axios.get(url, {
        params: {
          range: '1mo',
          interval: '1d',
          fundamental: 'false',
          token: process.env.BRAPI_TOKEN, // Cambiado 'apikey' a 'token'
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
        .sort((a, b) => b.date.getTime() - a.date.getTime());
  
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
        .sort((a, b) => b.date.getTime() - a.date.getTime());

      const currentPrice = data[0].close;
      const lastDate = data[0].date;

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
            (strategy === 'tp_sl' &&
              (currentProfit >= takeProfit || currentProfit <= -stopLoss)) ||
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
        successRate: (
          (operations.filter((op) => op.profit > 0).length / operations.length) *
          100
        ).toFixed(2),
        operations,
      });
    }

    return results;
  }
}
