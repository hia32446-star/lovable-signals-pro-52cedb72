// Realistic Market Data Simulator
// Generates professional-grade candlestick data with realistic price action

export interface MarketCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: Date;
}

export interface MarketData {
  pair: string;
  candles: MarketCandle[];
  currentPrice: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  volatility: number;
}

// Realistic base prices for major pairs
const PAIR_BASE_PRICES: Record<string, { price: number; decimals: number; pipSize: number }> = {
  'EUR/USD': { price: 1.0850, decimals: 5, pipSize: 0.0001 },
  'GBP/USD': { price: 1.2650, decimals: 5, pipSize: 0.0001 },
  'USD/JPY': { price: 149.50, decimals: 3, pipSize: 0.01 },
  'AUD/USD': { price: 0.6550, decimals: 5, pipSize: 0.0001 },
  'USD/CAD': { price: 1.3550, decimals: 5, pipSize: 0.0001 },
  'EUR/GBP': { price: 0.8580, decimals: 5, pipSize: 0.0001 },
  'EUR/JPY': { price: 162.20, decimals: 3, pipSize: 0.01 },
  'GBP/JPY': { price: 189.10, decimals: 3, pipSize: 0.01 },
  'AUD/JPY': { price: 97.80, decimals: 3, pipSize: 0.01 },
  'NZD/JPY': { price: 91.50, decimals: 3, pipSize: 0.01 },
  'CHF/JPY': { price: 168.30, decimals: 3, pipSize: 0.01 },
  'NZD/USD': { price: 0.6120, decimals: 5, pipSize: 0.0001 },
  'USD/CHF': { price: 0.8890, decimals: 5, pipSize: 0.0001 },
};

// Get price config for a pair
export const getPairConfig = (pair: string): { price: number; decimals: number; pipSize: number } => {
  // Check for exact match first
  for (const [key, config] of Object.entries(PAIR_BASE_PRICES)) {
    if (pair.includes(key.replace('/', ''))) return config;
    if (pair.includes(key)) return config;
  }

  // Default for OTC/unknown pairs
  if (pair.includes('JPY')) {
    return { price: 100 + Math.random() * 50, decimals: 3, pipSize: 0.01 };
  }
  return { price: 1.0 + Math.random() * 0.5, decimals: 5, pipSize: 0.0001 };
};

// Generate realistic market micro-structure
const generateMicroMovement = (pipSize: number): number => {
  // Gaussian-like distribution for natural price movement
  const u1 = Math.random();
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  
  // Scale to realistic pip movement (typically 1-5 pips per M1 candle)
  return gaussian * pipSize * (1 + Math.random() * 4);
};

// Simulate trend-following price action
const simulateTrendAction = (
  basePrice: number,
  trendBias: number,
  volatility: number,
  pipSize: number
): { change: number; isWithTrend: boolean } => {
  // Trend-following probability
  const trendProbability = 0.5 + trendBias * 0.25; // 25-75% based on trend strength
  const isWithTrend = Math.random() < trendProbability;
  
  const microMove = Math.abs(generateMicroMovement(pipSize)) * volatility;
  const change = isWithTrend ? microMove * Math.sign(trendBias) : -microMove * Math.sign(trendBias);
  
  return { change, isWithTrend };
};

// Generate realistic M1 candles with market dynamics
export const generateRealtimeCandles = (
  pair: string,
  numCandles: number,
  entryTime: Date,
  signalDirection: 'CALL' | 'PUT'
): MarketData => {
  const config = getPairConfig(pair);
  const candles: MarketCandle[] = [];
  
  // Add small random variation to base price
  let currentPrice = config.price + (Math.random() - 0.5) * config.pipSize * 50;
  
  // Start time calculation
  const startTime = new Date(entryTime.getTime() - numCandles * 60000);
  
  // Market phase simulation
  const phases = {
    consolidation: { volatility: 0.6, trendStrength: 0.1 },
    trending: { volatility: 0.9, trendStrength: 0.5 },
    breakout: { volatility: 1.5, trendStrength: 0.7 },
  };
  
  // Determine signal-aligned trend for last candles
  const signalTrend = signalDirection === 'CALL' ? 1 : -1;
  
  // Calculate average volatility for pair
  const baseVolatility = config.pipSize * (2 + Math.random() * 3);
  
  for (let i = 0; i < numCandles; i++) {
    const progress = i / numCandles;
    
    // Phase transition - move towards signal direction near end
    let phase: keyof typeof phases = 'consolidation';
    let trendBias = 0;
    
    if (progress < 0.3) {
      // Early candles - mixed movement
      phase = Math.random() > 0.7 ? 'trending' : 'consolidation';
      trendBias = (Math.random() - 0.5) * 0.3;
    } else if (progress < 0.7) {
      // Middle candles - building trend
      phase = Math.random() > 0.5 ? 'trending' : 'consolidation';
      trendBias = signalTrend * 0.2 + (Math.random() - 0.5) * 0.2;
    } else {
      // Final candles - strong alignment with signal
      phase = Math.random() > 0.6 ? 'breakout' : 'trending';
      trendBias = signalTrend * (0.4 + progress * 0.3);
    }
    
    const phaseConfig = phases[phase];
    const volatility = phaseConfig.volatility * (0.7 + Math.random() * 0.6);
    
    // Generate candle OHLC
    const open = currentPrice;
    const { change, isWithTrend } = simulateTrendAction(currentPrice, trendBias, volatility, config.pipSize);
    
    // Close price
    const close = open + change;
    
    // High and Low with realistic wicks
    const bodySize = Math.abs(change);
    const upperWickMultiplier = isWithTrend ? 0.2 + Math.random() * 0.3 : 0.3 + Math.random() * 0.5;
    const lowerWickMultiplier = isWithTrend ? 0.3 + Math.random() * 0.5 : 0.2 + Math.random() * 0.3;
    
    const high = Math.max(open, close) + bodySize * upperWickMultiplier * (0.5 + Math.random());
    const low = Math.min(open, close) - bodySize * lowerWickMultiplier * (0.5 + Math.random());
    
    // Volume simulation (higher on trend moves)
    const baseVolume = 1000 + Math.random() * 500;
    const volume = baseVolume * (isWithTrend ? 1.2 : 0.8) * volatility;
    
    candles.push({
      open: parseFloat(open.toFixed(config.decimals)),
      high: parseFloat(high.toFixed(config.decimals)),
      low: parseFloat(low.toFixed(config.decimals)),
      close: parseFloat(close.toFixed(config.decimals)),
      volume: Math.round(volume),
      time: new Date(startTime.getTime() + i * 60000),
    });
    
    currentPrice = close;
  }
  
  // Determine overall trend
  const firstPrice = candles[0].open;
  const lastPrice = candles[candles.length - 1].close;
  const priceChange = lastPrice - firstPrice;
  const trend = priceChange > config.pipSize * 5 ? 'bullish' : 
                priceChange < -config.pipSize * 5 ? 'bearish' : 'neutral';
  
  return {
    pair,
    candles,
    currentPrice: lastPrice,
    trend,
    volatility: baseVolatility,
  };
};

// Format price with correct decimals
export const formatPrice = (price: number, pair: string): string => {
  const config = getPairConfig(pair);
  return price.toFixed(config.decimals);
};

// Get real-time simulated price update
export const getRealtimePriceUpdate = (
  currentPrice: number,
  pair: string,
  trendDirection: 'CALL' | 'PUT'
): number => {
  const config = getPairConfig(pair);
  const trendBias = trendDirection === 'CALL' ? 0.3 : -0.3;
  const { change } = simulateTrendAction(currentPrice, trendBias, 0.8, config.pipSize);
  return parseFloat((currentPrice + change).toFixed(config.decimals));
};
