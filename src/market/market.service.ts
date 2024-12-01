// src/market/market.service.ts
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import IndicatorsStrategy from './strategies/indicators.strategy';

type Interval = '1d' | '1wk' | '1mo';

@Injectable()
export class MarketService {
  private brapiToken = process.env.BRAPI_TOKEN;

  constructor() {
    // Supresión opcional de logs
  }

  async runBacktest(
    tickers: string[],
    range: string,
    interval: string,
    strategy: string,
  ): Promise<any[]> {
    const results = [];
    for (const ticker of tickers) {
      try {
        const isB3 = ticker.endsWith('.SA');
        const { historicalData } = await this.getHistoricalDataFromBrapi(
          ticker,
          range,
          interval,
        );

        console.log(`[runBacktest] Ticker: ${ticker}, Historical Data Points: ${historicalData.length}`);

        // Ajuste: Mínimo de datos históricos requerido
        if (!historicalData || historicalData.length < 15) {
          results.push({
            ticker,
            message: 'Datos insuficientes para el backtest. Se necesitan al menos 15 datos históricos.',
          });
          continue;
        }

        let openPosition = null;
        const operations = [];

        for (let i = 0; i < historicalData.length; i++) {
          const { price, date } = historicalData[i];
          const slicedData = historicalData.slice(0, i + 1).map((d) => d.price);

          let signals;
          if (strategy === 'indicators') {
            signals = IndicatorsStrategy.analyzeSignals(slicedData);
          } else {
            signals = { buy: false, sell: false };
          }

          if (!openPosition && signals.buy) {
            openPosition = { type: 'buy', price, date };
            console.log(`[runBacktest] Buy executed for ${ticker} on ${date}, Price: ${price}`);
          } else if (openPosition && signals.sell) {
            const profit = price - openPosition.price;
            operations.push({
              type: 'trade',
              openDate: openPosition.date,
              closeDate: date,
              entryPrice: openPosition.price,
              exitPrice: price,
              profit: profit.toFixed(2),
              percentageChange: (((price - openPosition.price) / openPosition.price) * 100).toFixed(2),
            });
            console.log(`[runBacktest] Sell executed for ${ticker} on ${date}, Price: ${price}, Profit: ${profit.toFixed(2)}`);
            openPosition = null;
          }
        }

        if (openPosition) {
          const lastPrice = historicalData[historicalData.length - 1].price;
          const lastDate = historicalData[historicalData.length - 1].date;
          const profit = lastPrice - openPosition.price;
          operations.push({
            type: 'open',
            openDate: openPosition.date,
            closeDate: lastDate,
            entryPrice: openPosition.price,
            exitPrice: lastPrice,
            profit: profit.toFixed(2),
            percentageChange: (((lastPrice - openPosition.price) / openPosition.price) * 100).toFixed(2),
          });
          console.log(`[runBacktest] Closing position for ${ticker} on ${lastDate}, Price: ${lastPrice}, Profit: ${profit.toFixed(2)}`);
          openPosition = null;
        }

        results.push({
          ticker,
          operations,
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

  async getDailySignals(tickers: string[]): Promise<any[]> {
    const results = [];

    for (const ticker of tickers) {
      try {
        const isB3 = ticker.endsWith('.SA');

        const { historicalData, currentPrice, lastDate } = isB3
          ? await this.getHistoricalDataFromBrapi(
              ticker,
              '3mo',  // Intentando obtener más datos históricos para asegurar un análisis suficiente
              '1d',
            )
          : (() => { throw new Error('Funcionalidad no implementada para Yahoo Finance') })();

        console.log(`[getDailySignals] Ticker: ${ticker}, Historical Data:`, historicalData);
        console.log(`[getDailySignals] Ticker: ${ticker}, Current Price:`, currentPrice);

        // Ajuste: Verificamos si tenemos al menos 15 datos históricos
        if (!historicalData || historicalData.length < 15) {
          results.push({
            ticker,
            message: isB3
              ? 'BRAPI puede tener datos limitados para esta acción brasileña.'
              : 'Datos insuficientes para el análisis.',
          });
          continue;
        }

        const prices = [...historicalData.map((d) => d.price), currentPrice];
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
  // Función para obtener datos históricos (usada por el endpoint de señales)
  async getHistoricalData(ticker: string, isB3: boolean): Promise<any> {
    if (isB3) {
      return await this.getHistoricalDataFromBrapi(
        ticker,
        '1mo', // Último mes
        '1d',
      );
    } else {
      // Logica para Yahoo Finance (sin implementación)
      throw new Error('Funcionalidad no implementada para Yahoo Finance');
    }
  }

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
}
