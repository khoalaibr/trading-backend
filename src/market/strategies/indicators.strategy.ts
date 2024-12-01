// src/market/strategies/indicators.strategy.ts
export class IndicatorsStrategy {
  static analyzeSignals(historicalData: number[]): { buy: boolean; sell: boolean } {
    if (historicalData.length < 20) return { buy: false, sell: false };

    const price = historicalData[0];
    const sma = this.calculateSMA(historicalData, 14);
    const rsi = this.calculateRSI(historicalData, 14);
    const { upper, lower } = this.calculateBollingerBands(historicalData, 20);

    return {
      buy: price < lower && rsi < 40,
      sell: price > upper && rsi > 60,
    };
  }

  static calculateSMA(data: number[], period: number): number {
    const slice = data.slice(0, period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  static calculateRSI(data: number[], period: number): number {
    const gains = [];
    const losses = [];
    for (let i = 1; i < period; i++) {
      const diff = data[i - 1] - data[i];
      if (diff > 0) gains.push(diff);
      else losses.push(Math.abs(diff));
    }
    const avgGain = gains.reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / period;

    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  static calculateBollingerBands(
    data: number[],
    period: number,
  ): { upper: number; lower: number; middle: number } {
    const sma = this.calculateSMA(data, period);
    const variance =
      data.slice(0, period).reduce((acc, price) => acc + Math.pow(price - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    return {
      upper: sma + 2 * stdDev,
      lower: sma - 2 * stdDev,
      middle: sma,
    };
  }
}
