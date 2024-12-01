// src/market/market.service.ts

import { Injectable } from '@nestjs/common';
import axios from 'axios';
import yahooFinance from 'yahoo-finance2';
import { IndicatorsStrategy } from './strategies/indicators.strategy';
import { LongShortStrategy } from './strategies/long-short.strategy';

type Interval = '1d' | '1wk' | '1mo';

@Injectable()
export class MarketService {
  private brapiToken = process.env.BRAPI_TOKEN;

  constructor() {
    // Supresión opcional de logs
    // yahooFinance.options.logger = () => {};
  }

  // Función para obtener datos históricos (usada por el endpoint de señales)
  async getHistoricalData(ticker: string, isB3: boolean): Promise<any> {
    if (isB3) {
      return await this.getHistoricalDataFromBrapi(
        ticker,
        '1mo', // Último mes
        '1d',
      );
    } else {
      return await this.getHistoricalDataFromYahoo(
        ticker,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Últimos 30 días
        new Date(),
        '1d',
      );
    }
  }

  // Endpoint de señales diarias
  // Endpoint de señales diarias
async getDailySignals(tickers: string[]): Promise<any[]> {
  const results = [];

  for (const ticker of tickers) {
    try {
      const isB3 = ticker.endsWith('.SA');

      const { historicalData, currentPrice, lastDate } = isB3
        ? await this.getHistoricalDataFromBrapi(
            ticker,
            '1mo', // Último mes
            '1d',
          )
        : await this.getHistoricalDataFromYahoo(
            ticker,
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Últimos 30 días
            new Date(),
            '1d',
          );

      // Debugging: Agregar log para revisar los datos históricos obtenidos.
      console.log(`[getDailySignals] Ticker: ${ticker}, Historical Data:`, historicalData);
      console.log(`[getDailySignals] Ticker: ${ticker}, Current Price:`, currentPrice);

      // Reducción del requisito de datos históricos para permitir análisis
      if (!historicalData || historicalData.length < 15) {
        results.push({
          ticker,
          message: isB3
            ? 'BRAPI puede tener datos limitados para esta acción brasileña.'
            : 'Datos insuficientes para el análisis.',
        });
        continue;
      }

      // Añadir el precio actual al inicio de la lista de precios para el análisis
      const prices = [...historicalData.map((d) => d.price), currentPrice];

      // Realizar análisis de señales con los datos disponibles
      const signals = IndicatorsStrategy.analyzeSignals(prices);

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


  // Función para obtener datos históricos desde BRAPI
  async getHistoricalDataFromBrapi(
    ticker: string,
    range: string,
    interval: string,
  ): Promise<any> {
    const url = `https://brapi.dev/api/quote/${ticker.replace('.SA', '')}`;
    try {
      console.log('[getHistoricalDataFromBrapi] Solicitando URL:', url, {
        interval: interval,
        fundamental: 'false',
        history: 'true',
        range: range,
        token: this.brapiToken,
      });

      const response = await axios.get(url, {
        params: {
          interval: interval,
          fundamental: 'false',
          history: 'true',
          range: range,
          token: this.brapiToken,
        },
      });

      const data = response.data;

      if (
        !data ||
        !data.results ||
        data.results.length === 0 ||
        !data.results[0].historicalDataPrice
      ) {
        throw new Error(`Datos inválidos para ${ticker} en BRAPI.`);
      }

      const quotes = data.results[0].historicalDataPrice;
      if (!quotes || quotes.length === 0) {
        throw new Error(
          `No hay datos históricos disponibles para ${ticker} en BRAPI.`,
        );
      }

      // Transformar los datos históricos al formato esperado
      const historicalData = quotes
        .map((quote) => ({
          date: new Date(quote.date * 1000), // Convertir de timestamp UNIX
          price: quote.close,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime()); // Orden ascendente

      const currentPrice = data.results[0].regularMarketPrice;
      const lastDate = data.results[0].regularMarketTime
        ? new Date(data.results[0].regularMarketTime)
        : new Date();

      // Debugging: Agregar log para verificar los datos transformados
      console.log('[getHistoricalDataFromBrapi] Datos transformados:', {
        historicalData,
        currentPrice,
        lastDate,
      });

      return {
        historicalData,
        currentPrice,
        lastDate,
      };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.error(`Ticker no encontrado en BRAPI: ${ticker}`);
        throw new Error(`Ticker no encontrado en BRAPI: ${ticker}`);
      }
      throw new Error(
        `Error al obtener datos históricos para ${ticker} de BRAPI: ${error.message}`,
      );
    }
  }

  // Función para obtener datos históricos desde Yahoo Finance
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

  // Endpoint de backtesting
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
        `Intervalo inválido: ${interval}. Los intervalos válidos son: ${validIntervals.join(
          ', ',
        )}`,
      );
    }
    const intervalCasted = interval as Interval;

    // Calcular el rango basado en startDate y endDate
    const dateDiff = new Date(endDate).getTime() - new Date(startDate).getTime();
    const daysDiff = dateDiff / (1000 * 60 * 60 * 24);
    let range = '';
    if (daysDiff <= 5) range = '5d';
    else if (daysDiff <= 30) range = '1mo';
    else if (daysDiff <= 90) range = '3mo';
    else if (daysDiff <= 180) range = '6mo';
    else if (daysDiff <= 365) range = '1y';
    else range = '1y'; // Máximo permitido por el plan

    for (const ticker of tickers) {
      const isB3 = ticker.endsWith('.SA');

      try {
        const { historicalData } = isB3
          ? await this.getHistoricalDataFromBrapi(ticker, range, intervalCasted)
          : await this.getHistoricalDataFromYahoo(
              ticker,
              new Date(startDate),
              new Date(endDate),
              intervalCasted,
            );

        console.log(
          `[runBacktest] Ticker: ${ticker}, Historical Data Points: ${historicalData.length}`,
        );

        if (!historicalData || historicalData.length === 0) {
          results.push({
            ticker,
            message: 'Datos insuficientes para el backtest.',
          });
          continue;
        }

        // Lógica de backtesting...
        // Añadir logs aquí si necesitas verificar algún comportamiento específico durante el proceso

      } catch (error) {
        results.push({
          ticker,
          message: `Error al obtener datos para ${ticker}: ${error.message}`,
        });
      }
    }

    return results;
  }
}
