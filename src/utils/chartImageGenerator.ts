import { MarketCandle, generateRealtimeCandles, getPairConfig } from './marketSimulator';

interface ChartConfig {
  pair: string;
  direction: 'CALL' | 'PUT';
  price: string;
  time: string;
  entryTime: Date;
  candles?: MarketCandle[]; // Optional pre-generated candles from analysis
}

export const generateChartImage = async (config: ChartConfig): Promise<Blob> => {
  const width = 1000;
  const height = 550;
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  
  // Pure black background like reference
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  
  // Use provided candles or generate new ones
  const pairConfig = getPairConfig(config.pair);
  const candles = config.candles || generateRealtimeCandles(config.pair, 35, config.entryTime, config.direction).candles;
  
  // Calculate price range with padding
  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice;
  const pricePadding = priceRange * 0.15;
  const chartMinPrice = minPrice - pricePadding;
  const chartMaxPrice = maxPrice + pricePadding * 2; // Extra top padding for arrow
  const chartPriceRange = chartMaxPrice - chartMinPrice;
  
  const chartLeft = 70;
  const chartRight = width - 40;
  const chartTop = 50;
  const chartBottom = height - 50;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  
  const candleSpacing = chartWidth / candles.length;
  const candleWidth = candleSpacing * 0.7;
  
  const xScale = (i: number) => chartLeft + (i + 0.5) * candleSpacing;
  const yScale = (price: number) => chartTop + ((chartMaxPrice - price) / chartPriceRange) * chartHeight;
  
  // Draw title: PAIR (OTC) - DIRECTION
  const marketType = config.pair.includes('OTC') ? '(OTC)' : '';
  const pairName = config.pair.replace(' (OTC)', '').replace('-OTC', '');
  const titleText = `${pairName} ${marketType} - ${config.direction}`.trim();
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(titleText, width / 2, 30);
  
  // Draw candles
  candles.forEach((candle, i) => {
    const x = xScale(i);
    const isGreen = candle.close >= candle.open;
    const color = isGreen ? '#00ff00' : '#ff0000';
    
    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, yScale(candle.high));
    ctx.lineTo(x, yScale(candle.low));
    ctx.stroke();
    
    // Body
    ctx.fillStyle = color;
    const bodyTop = yScale(Math.max(candle.open, candle.close));
    const bodyBottom = yScale(Math.min(candle.open, candle.close));
    const bodyHeight = Math.max(2, bodyBottom - bodyTop);
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
  });
  
  // Entry line - dashed yellow/gold line at last candle price
  const lastCandle = candles[candles.length - 1];
  const entryPrice = lastCandle.close;
  const entryY = yScale(entryPrice);
  
  ctx.strokeStyle = '#ffd700';
  ctx.setLineDash([8, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(chartLeft, entryY);
  ctx.lineTo(chartRight, entryY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // BUY/SELL arrow at the right side
  const arrowX = xScale(candles.length - 1) + candleSpacing * 0.8;
  const arrowColor = config.direction === 'CALL' ? '#00ff00' : '#ff0000';
  const arrowLabel = config.direction === 'CALL' ? 'BUY' : 'SELL';
  
  // Arrow label
  ctx.fillStyle = arrowColor;
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.textAlign = 'center';
  
  if (config.direction === 'CALL') {
    ctx.fillText(arrowLabel, arrowX, entryY - 35);
    // Down arrow pointing to entry
    ctx.beginPath();
    ctx.moveTo(arrowX, entryY - 30);
    ctx.lineTo(arrowX, entryY - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(arrowX, entryY - 5);
    ctx.lineTo(arrowX - 6, entryY - 12);
    ctx.lineTo(arrowX + 6, entryY - 12);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillText(arrowLabel, arrowX, entryY + 45);
    // Up arrow pointing to entry
    ctx.beginPath();
    ctx.moveTo(arrowX, entryY + 30);
    ctx.lineTo(arrowX, entryY + 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(arrowX, entryY + 5);
    ctx.lineTo(arrowX - 6, entryY + 12);
    ctx.lineTo(arrowX + 6, entryY + 12);
    ctx.closePath();
    ctx.fill();
  }
  
  // Price axis labels (left side)
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px Arial, sans-serif';
  ctx.textAlign = 'right';
  
  const priceSteps = 5;
  const priceDecimals = pairConfig.decimals;
  for (let i = 0; i <= priceSteps; i++) {
    const price = chartMaxPrice - (i / priceSteps) * chartPriceRange;
    const y = chartTop + (i / priceSteps) * chartHeight;
    ctx.fillText(price.toFixed(priceDecimals) + ' -', chartLeft - 8, y + 4);
  }
  
  // "Price" label
  ctx.save();
  ctx.translate(15, chartTop + chartHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('Price', 0, 0);
  ctx.restore();
  
  // Time axis labels (bottom)
  ctx.textAlign = 'center';
  ctx.font = '11px Arial, sans-serif';
  
  // Show time labels every 3 candles
  for (let i = 0; i < candles.length; i += 3) {
    const candle = candles[i];
    const x = xScale(i);
    const timeStr = candle.time.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    ctx.fillText(timeStr, x, chartBottom + 20);
  }
  
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob!);
    }, 'image/png', 1.0);
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
