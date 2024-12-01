// src/market/strategies/indicators.strategy.ts
export class IndicatorsStrategy {
  static analyzeSignals(historicalData: number[]): { buy: boolean; sell: boolean } {
    // Calculamos el periodo con la menor longitud entre los datos históricos y 14 para permitir un análisis más temprano
    const period = Math.min(historicalData.length, 14);
    
    // Asegurarse de que haya suficientes datos para calcular
    if (period < 10) {
        console.log(`[analyzeSignals] Datos insuficientes, periodo: ${period}`);
        return { buy: false, sell: false };
    }

    const price = historicalData[0];
    const sma = this.calculateSMA(historicalData, period);
    const rsi = this.calculateRSI(historicalData, Math.min(historicalData.length, 14));
    const { upper, lower } = this.calculateBollingerBands(historicalData, period);

    // Agregar registros de cada indicador para ayudar en la depuración
    console.log(`[analyzeSignals] Price: ${price}, SMA(${period}): ${sma}, RSI(14): ${rsi}, Bollinger Bands - Upper: ${upper}, Lower: ${lower}`);

    const buyCondition = price < lower && rsi < 40;
    const sellCondition = price > upper && rsi > 60;

    // Mostrar las condiciones que evalúan a buy y sell
    console.log(`[analyzeSignals] Buy Condition: ${buyCondition}, Sell Condition: ${sellCondition}`);

    return {
        buy: buyCondition,
        sell: sellCondition,
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

export default IndicatorsStrategy;