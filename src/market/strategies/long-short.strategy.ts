// src/market/strategies/long-short.strategy.ts
export class LongShortStrategy {
    static analyzeSignals(historicalData: number[]): { long: boolean; short: boolean } {
      // Implementación simplificada de una estrategia Long & Short
      const price = historicalData[0];
      const smaShortTerm = this.calculateSMA(historicalData, 7);
      const smaLongTerm = this.calculateSMA(historicalData, 21);
  
      return {
        long: smaShortTerm > smaLongTerm,
        short: smaShortTerm < smaLongTerm,
      };
    }
  
    static calculateSMA(data: number[], period: number): number {
      const slice = data.slice(0, period);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    }
  }
  