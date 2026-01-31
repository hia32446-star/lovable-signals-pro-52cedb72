// Real Market Data API Service
// Fetches live market data from external API

export interface MarketTick {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface MarketApiResponse {
  success: boolean;
  symbol: string;
  data: MarketTick[];
  currentPrice: number;
  timestamp: number;
}

export interface LiveMarketData {
  candles: MarketTick[];
  currentPrice: number;
  entryPrice: number;
  symbol: string;
  fetchedAt: Date;
}

const API_BASE_URL = 'http://217.154.173.102:11955/api/market/quotex';

// Convert pair symbol to API format
const formatSymbolForApi = (symbol: string): string => {
  // Remove spaces and standardize format
  // Examples: "EUR/USD (OTC)" -> "EURUSD-OTC", "BRLUSD-OTC" -> "BRLUSD-OTC"
  return symbol
    .replace(/\s*\(OTC\)\s*/i, '-OTC')
    .replace(/\s+/g, '')
    .replace('/', '');
};

// Fetch real market data from API
export const fetchMarketData = async (symbol: string): Promise<LiveMarketData | null> => {
  const formattedSymbol = formatSymbolForApi(symbol);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const response = await fetch(`${API_BASE_URL}/?symbol=${formattedSymbol}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`Market API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    
    // Handle different API response formats
    let candles: MarketTick[] = [];
    let currentPrice = 0;
    
    if (Array.isArray(data)) {
      // If data is an array of candles
      candles = data.map((item: any) => ({
        time: item.time || item.t || Date.now(),
        open: parseFloat(item.open || item.o || 0),
        high: parseFloat(item.high || item.h || 0),
        low: parseFloat(item.low || item.l || 0),
        close: parseFloat(item.close || item.c || 0),
        volume: parseFloat(item.volume || item.v || 0),
      }));
      currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
    } else if (data.data && Array.isArray(data.data)) {
      // If data has a 'data' property with array
      candles = data.data.map((item: any) => ({
        time: item.time || item.t || Date.now(),
        open: parseFloat(item.open || item.o || 0),
        high: parseFloat(item.high || item.h || 0),
        low: parseFloat(item.low || item.l || 0),
        close: parseFloat(item.close || item.c || 0),
        volume: parseFloat(item.volume || item.v || 0),
      }));
      currentPrice = data.price || data.currentPrice || (candles.length > 0 ? candles[candles.length - 1].close : 0);
    } else if (data.price || data.currentPrice) {
      // If just price data
      currentPrice = parseFloat(data.price || data.currentPrice);
    }
    
    return {
      candles,
      currentPrice,
      entryPrice: currentPrice,
      symbol: formattedSymbol,
      fetchedAt: new Date(),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Market API request timeout');
    } else {
      console.error('Market API fetch error:', error);
    }
    return null;
  }
};

// Get current price for result validation
export const getCurrentPrice = async (symbol: string): Promise<number | null> => {
  const data = await fetchMarketData(symbol);
  return data?.currentPrice || null;
};

// Store for tracking trade entries
interface TradeEntry {
  signalId: string;
  pair: string;
  direction: 'CALL' | 'PUT';
  entryPrice: number;
  entryTime: Date;
  marketData: LiveMarketData;
}

const activeTradeEntries = new Map<string, TradeEntry>();

export const recordTradeEntry = (
  signalId: string, 
  pair: string, 
  direction: 'CALL' | 'PUT', 
  entryPrice: number,
  marketData: LiveMarketData
): void => {
  activeTradeEntries.set(signalId, {
    signalId,
    pair,
    direction,
    entryPrice,
    entryTime: new Date(),
    marketData,
  });
};

export const getTradeEntry = (signalId: string): TradeEntry | undefined => {
  return activeTradeEntries.get(signalId);
};

export const clearTradeEntry = (signalId: string): void => {
  activeTradeEntries.delete(signalId);
};

// Validate trade result using real market data
export const validateTradeResult = async (
  signalId: string, 
  direction: 'CALL' | 'PUT'
): Promise<{ isWin: boolean; entryPrice: number; exitPrice: number; priceDiff: number } | null> => {
  const entry = activeTradeEntries.get(signalId);
  
  if (!entry) {
    console.error('No trade entry found for signal:', signalId);
    return null;
  }
  
  // Fetch current price for exit
  const exitPrice = await getCurrentPrice(entry.pair);
  
  if (exitPrice === null) {
    console.error('Could not fetch exit price for:', entry.pair);
    return null;
  }
  
  const priceDiff = exitPrice - entry.entryPrice;
  
  // CALL wins if price went UP, PUT wins if price went DOWN
  const isWin = direction === 'CALL' ? priceDiff > 0 : priceDiff < 0;
  
  // Clean up entry
  activeTradeEntries.delete(signalId);
  
  return {
    isWin,
    entryPrice: entry.entryPrice,
    exitPrice,
    priceDiff,
  };
};

// Convert API candles to chart format
export const convertToChartCandles = (apiCandles: MarketTick[]): {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}[] => {
  return apiCandles.map((candle, index) => ({
    time: new Date(candle.time || Date.now() - (apiCandles.length - index) * 60000),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
};
