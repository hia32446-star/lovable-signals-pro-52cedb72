 import { MarketCandle, generateRealtimeCandles, getPairConfig } from './marketSimulator';
 import { fetchMarketData, convertToChartCandles } from './marketApi';
 import { analyzeCandlestickPatterns, CandleData, PatternResult } from './candlestickPatterns';
 
 // Generic candle interface that works with both simulated and API data
 interface ChartCandle {
   time: Date | number;
   open: number;
   high: number;
   low: number;
   close: number;
 }
 
interface ChartConfig {
  pair: string;
  direction: 'CALL' | 'PUT';
  price: string;
  time: string;
  entryTime: Date;
  candles?: MarketCandle[] | ChartCandle[];
  isRealData?: boolean;
  showPatterns?: boolean;
  showIndicators?: boolean;
  detectedPatterns?: PatternResult[];
  result?: 'WIN' | 'MTG_WIN' | 'LOSS' | 'DOJI';
}
 
 interface ChartGenerationResult {
   blob: Blob;
   usedRealData: boolean;
   candleCount: number;
   detectedPatterns: PatternResult[];
   currentPrice: number;
 }
 
 // Fetch real-time candles from API
 export const fetchRealTimeCandles = async (pair: string, count: number = 50): Promise<{
   candles: ChartCandle[];
   currentPrice: number;
   patterns: PatternResult[];
   success: boolean;
 } | null> => {
   try {
     const data = await fetchMarketData(pair);
     
     if (!data || data.candles.length === 0) {
       console.log(`No real data for ${pair}, will use simulation`);
       return null;
     }
     
     const chartCandles = convertToChartCandles(data.candles);
     const recentCandles = chartCandles.slice(-count);
     
     const candleData: CandleData[] = recentCandles.map(c => ({
       time: c.time,
       open: c.open,
       high: c.high,
       low: c.low,
       close: c.close,
     }));
     
     const analysis = analyzeCandlestickPatterns(candleData);
     console.log(`Fetched ${recentCandles.length} real candles for ${pair}, detected ${analysis.patterns.length} patterns`);
     
     return {
       candles: recentCandles,
       currentPrice: data.currentPrice,
       patterns: analysis.patterns,
       success: true,
     };
   } catch (error) {
     console.error(`Failed to fetch real candles for ${pair}:`, error);
     return null;
   }
 };
 
 // Calculate Simple Moving Average
 const calculateSMA = (candles: ChartCandle[], period: number): number[] => {
   const sma: number[] = [];
   for (let i = 0; i < candles.length; i++) {
     if (i < period - 1) {
       sma.push(NaN);
     } else {
       let sum = 0;
       for (let j = i - period + 1; j <= i; j++) {
         sum += candles[j].close;
       }
       sma.push(sum / period);
     }
   }
   return sma;
 };
 
 // Generate chart with real API data (preferred) or fall back to simulation
 export const generateChartWithRealData = async (config: ChartConfig): Promise<ChartGenerationResult> => {
   const { pair, direction, entryTime } = config;
   
   const realData = await fetchRealTimeCandles(pair, 35);
   
   let candles: ChartCandle[];
   let detectedPatterns: PatternResult[] = [];
   let usedRealData = false;
   let currentPrice = 0;
   
   if (realData && realData.candles.length >= 10) {
     candles = realData.candles;
     detectedPatterns = realData.patterns;
     currentPrice = realData.currentPrice;
     usedRealData = true;
     console.log(`Using real market data for ${pair} chart (${candles.length} candles)`);
   } else {
     const simulated = generateRealtimeCandles(pair, 35, entryTime, direction);
     candles = simulated.candles;
     currentPrice = simulated.candles[simulated.candles.length - 1].close;
     console.log(`Using simulated data for ${pair} chart`);
   }
   
   const blob = await generateChartImage({
     ...config,
     candles,
     isRealData: usedRealData,
     showPatterns: true,
     showIndicators: true,
     detectedPatterns,
   });
   
   return {
     blob,
     usedRealData,
     candleCount: candles.length,
     detectedPatterns,
     currentPrice,
   };
 };
 
const getDisplayName = (pair: string): string => {
  return pair
    .replace(/\s*\(OTC\)\s*/gi, '')
    .replace(/-OTC/gi, '')
    .replace(/_otc/gi, '')
    .replace(/\//g, '')
    .trim();
};

const getTradeTimeLabel = (config: ChartConfig): string => {
  if (config.time) {
    return config.time;
  }

  return config.entryTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const formatAxisTime = (time: Date | number): string => {
  const candleTime = time instanceof Date ? time : new Date(time);
  return candleTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const drawText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    color?: string;
    font?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
  } = {}
) => {
  ctx.fillStyle = options.color ?? '#ffffff';
  ctx.font = options.font ?? '11px Arial, sans-serif';
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = options.baseline ?? 'alphabetic';
  ctx.fillText(text, x, y);
};

export const generateChartImage = async (config: ChartConfig): Promise<Blob> => {
  const width = 1200;
  const height = 600;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context not available');
  }

  const sourceCandles = config.candles || generateRealtimeCandles(config.pair, 40, config.entryTime, config.direction).candles;
  const candles = sourceCandles.length >= 40 ? sourceCandles.slice(-40) : sourceCandles;

  if (candles.length === 0) {
    throw new Error('No candles available for chart generation');
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const priceRange = Math.max(maxPrice - minPrice, closes[closes.length - 1] * 0.001);
  const padding = priceRange * 0.08;
  const chartMinPrice = minPrice - padding;
  const chartMaxPrice = maxPrice + padding;
  const chartRange = chartMaxPrice - chartMinPrice;

  const marginLeft = 50;
  const marginRight = 20;
  const marginTop = 42;
  const marginBottom = 42;
  const chartLeft = marginLeft;
  const chartTop = marginTop;
  const chartWidth = width - marginLeft - marginRight;
  const chartHeight = height - marginTop - marginBottom;
  const chartRight = chartLeft + chartWidth;
  const chartBottom = chartTop + chartHeight;

  const xScale = (index: number) => chartLeft + (index / Math.max(candles.length - 1, 1)) * chartWidth;
  const yScale = (price: number) => chartTop + ((chartMaxPrice - price) / chartRange) * chartHeight;
  const candleStep = chartWidth / candles.length;
  const candleWidth = candleStep * 0.7;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1;
  ctx.strokeRect(chartLeft, chartTop, chartWidth, chartHeight);

  const verticalGridCount = 8;
  const horizontalGridCount = 6;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 0.6;

  for (let i = 1; i < verticalGridCount; i++) {
    const x = chartLeft + (i / verticalGridCount) * chartWidth;
    ctx.beginPath();
    ctx.moveTo(x, chartTop);
    ctx.lineTo(x, chartBottom);
    ctx.stroke();
  }

  for (let i = 1; i < horizontalGridCount; i++) {
    const y = chartTop + (i / horizontalGridCount) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();
  }

  candles.forEach((candle, index) => {
    const bull = candle.close >= candle.open;
    const color = bull ? '#00e676' : '#ff1744';
    const x = xScale(index);
    const openY = yScale(candle.open);
    const closeY = yScale(candle.close);
    const highY = yScale(candle.high);
    const lowY = yScale(candle.low);
    const bodyTop = Math.min(openY, closeY);
    const rawBodyHeight = Math.abs(closeY - openY);
    const minimumBodyHeight = Math.max(2, (lowY - highY) * 0.02);
    const bodyHeight = Math.max(rawBodyHeight, minimumBodyHeight);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
  });

  if (!config.result) {
    const sigX = xScale(candles.length - 1);
    const lastHigh = highs[highs.length - 1];
    const lastLow = lows[lows.length - 1];
    const range = (lastHigh - lastLow) || closes[closes.length - 1] * 0.001;

    ctx.strokeStyle = config.direction === 'CALL' ? '#00e676' : '#ff1744';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.8;

    if (config.direction === 'CALL') {
      const targetY = yScale(lastLow);
      const textY = yScale(lastLow - range * 0.18);

      drawText(ctx, '▲ CALL', sigX, textY, {
        color: '#00e676',
        font: 'bold 11px Arial, sans-serif',
        align: 'center',
      });

      ctx.beginPath();
      ctx.moveTo(sigX, textY + 6);
      ctx.lineTo(sigX, targetY - 6);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(sigX, targetY);
      ctx.lineTo(sigX - 5, targetY - 8);
      ctx.lineTo(sigX + 5, targetY - 8);
      ctx.closePath();
      ctx.fill();
    } else {
      const targetY = yScale(lastHigh);
      const textY = yScale(lastHigh + range * 0.18);

      drawText(ctx, '▼ PUT', sigX, textY, {
        color: '#ff1744',
        font: 'bold 11px Arial, sans-serif',
        align: 'center',
      });

      ctx.beginPath();
      ctx.moveTo(sigX, textY - 6);
      ctx.lineTo(sigX, targetY + 6);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(sigX, targetY);
      ctx.lineTo(sigX - 5, targetY + 8);
      ctx.lineTo(sigX + 5, targetY + 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (config.result) {
    const resultLabel = {
      WIN: 'WIN',
      MTG_WIN: 'MTG WIN',
      LOSS: 'LOSS',
      DOJI: 'DOJI',
    }[config.result] ?? config.result;

    const resultColor = {
      WIN: '#00e676',
      MTG_WIN: '#00e676',
      LOSS: '#ff1744',
      DOJI: '#FFC107',
    }[config.result] ?? '#ffffff';

    const text = resultLabel;
    ctx.font = 'bold 15px Arial, sans-serif';
    const metrics = ctx.measureText(text);
    const boxWidth = metrics.width + 24;
    const boxHeight = 34;
    const boxX = width - boxWidth - 22;
    const boxY = 22;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.strokeStyle = resultColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 10);
    ctx.fill();
    ctx.stroke();

    drawText(ctx, text, boxX + boxWidth - 12, boxY + 22, {
      color: resultColor,
      font: 'bold 15px Arial, sans-serif',
      align: 'right',
    });
  }

  const yTickCount = 6;
  const pairConfig = getPairConfig(config.pair);
  for (let i = 0; i < yTickCount; i++) {
    const ratio = i / (yTickCount - 1);
    const price = chartMaxPrice - ratio * chartRange;
    const y = chartTop + ratio * chartHeight;
    drawText(ctx, price.toFixed(pairConfig.decimals), chartLeft - 8, y + 4, {
      color: '#666666',
      font: '12px Arial, sans-serif',
      align: 'right',
    });
  }

  const step = Math.max(1, Math.floor(candles.length / 8));
  for (let i = 0; i < candles.length; i += step) {
    const x = xScale(i);
    drawText(ctx, formatAxisTime(candles[i].time), x, chartBottom + 18, {
      color: '#666666',
      font: '12px Arial, sans-serif',
      align: 'center',
    });
  }

  ctx.strokeStyle = '#222222';
  ['top', 'right', 'left', 'bottom'];

  const title = `𝗡𝗲𝘂𝗿𝗼𝗧𝗿𝗮𝗱𝗲𝗫  |  ${getDisplayName(config.pair)}  M1  |  ${config.direction}  @  ${getTradeTimeLabel(config)}`;
  drawText(ctx, title, width / 2, 18, {
    color: '#ffffff',
    font: 'bold 11px Arial, sans-serif',
    align: 'center',
    baseline: 'top',
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate chart image blob'));
        return;
      }

      resolve(blob);
    }, 'image/png', 1);
  });
};
 
 export const blobToBase64 = (blob: Blob): Promise<string> => {
   return new Promise((resolve, reject) => {
     const reader = new FileReader();
     reader.onloadend = () => {
       const base64 = (reader.result as string).split(',')[1];
       resolve(base64);
     };
     reader.onerror = reject;
     reader.readAsDataURL(blob);
   });
 };