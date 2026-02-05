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
 
 export const generateChartImage = async (config: ChartConfig): Promise<Blob> => {
   const width = 1100;
   const height = 600;
   
   const canvas = document.createElement('canvas');
   canvas.width = width;
   canvas.height = height;
   const ctx = canvas.getContext('2d')!;
   
   // Dark gradient background
   ctx.fillStyle = '#000000';
   ctx.fillRect(0, 0, width, height);
   
   const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
   bgGradient.addColorStop(0, 'rgba(20, 20, 40, 0.3)');
   bgGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
   ctx.fillStyle = bgGradient;
   ctx.fillRect(0, 0, width, height);
   
   const pairConfig = getPairConfig(config.pair);
   const candles = config.candles || generateRealtimeCandles(config.pair, 35, config.entryTime, config.direction).candles;
   
   const allPrices = candles.flatMap(c => [c.high, c.low]);
   const minPrice = Math.min(...allPrices);
   const maxPrice = Math.max(...allPrices);
   const priceRange = maxPrice - minPrice;
   const pricePadding = priceRange * 0.15;
   const chartMinPrice = minPrice - pricePadding;
   const chartMaxPrice = maxPrice + pricePadding * 2;
   const chartPriceRange = chartMaxPrice - chartMinPrice;
   
   const chartLeft = 80;
   const chartRight = width - 60;
   const chartTop = 65;
   const chartBottom = height - 60;
   const chartWidth = chartRight - chartLeft;
   const chartHeight = chartBottom - chartTop;
   
   const candleSpacing = chartWidth / candles.length;
   const candleWidth = candleSpacing * 0.7;
   
   const xScale = (i: number) => chartLeft + (i + 0.5) * candleSpacing;
   const yScale = (price: number) => chartTop + ((chartMaxPrice - price) / chartPriceRange) * chartHeight;
   
   // Draw grid lines
   ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
   ctx.lineWidth = 0.5;
   for (let i = 0; i <= 5; i++) {
     const y = chartTop + (i / 5) * chartHeight;
     ctx.beginPath();
     ctx.moveTo(chartLeft, y);
     ctx.lineTo(chartRight, y);
     ctx.stroke();
   }
   
   // Draw Moving Averages
   if (config.showIndicators !== false) {
     const ma10 = calculateSMA(candles as ChartCandle[], 10);
     const ma20 = calculateSMA(candles as ChartCandle[], 20);
     
     // MA10 (orange)
     ctx.strokeStyle = '#ff9800';
     ctx.lineWidth = 1.5;
     ctx.beginPath();
     let started = false;
     for (let i = 0; i < ma10.length; i++) {
       if (!isNaN(ma10[i])) {
         const x = xScale(i);
         const y = yScale(ma10[i]);
         if (!started) { ctx.moveTo(x, y); started = true; } 
         else { ctx.lineTo(x, y); }
       }
     }
     ctx.stroke();
     
     // MA20 (blue)
     ctx.strokeStyle = '#2196f3';
     ctx.lineWidth = 1.5;
     ctx.beginPath();
     started = false;
     for (let i = 0; i < ma20.length; i++) {
       if (!isNaN(ma20[i])) {
         const x = xScale(i);
         const y = yScale(ma20[i]);
         if (!started) { ctx.moveTo(x, y); started = true; } 
         else { ctx.lineTo(x, y); }
       }
     }
     ctx.stroke();
   }
   
   // Title with data source indicator
   const marketType = config.pair.includes('OTC') || config.pair.includes('_otc') ? '(OTC)' : '';
   const pairName = config.pair.replace(' (OTC)', '').replace('-OTC', '').replace('_otc', '');
   const dataSource = config.isRealData ? '🔴 LIVE' : '📊 SIM';
   const titleText = `${pairName} ${marketType} - ${config.direction} ${dataSource}`.trim();
   
   ctx.fillStyle = '#ffffff';
   ctx.font = 'bold 22px Arial, sans-serif';
   ctx.textAlign = 'center';
   ctx.fillText(titleText, width / 2, 30);
   
   // Pattern label
   if (config.detectedPatterns && config.detectedPatterns.length > 0) {
     const primaryPattern = config.detectedPatterns[0];
     ctx.fillStyle = primaryPattern.direction === 'CALL' ? '#00ff00' : '#ff4444';
     ctx.font = 'bold 14px Arial, sans-serif';
     ctx.fillText(`Pattern: ${primaryPattern.pattern} (${Math.round(primaryPattern.confidence * 100)}%)`, width / 2, 52);
   }
   
   // Draw candles
   candles.forEach((candle, i) => {
     const x = xScale(i);
     const isGreen = candle.close >= candle.open;
     const color = isGreen ? '#00ff00' : '#ff0000';
     
     ctx.strokeStyle = color;
     ctx.lineWidth = 1.5;
     ctx.beginPath();
     ctx.moveTo(x, yScale(candle.high));
     ctx.lineTo(x, yScale(candle.low));
     ctx.stroke();
     
     ctx.fillStyle = color;
     const bodyTop = yScale(Math.max(candle.open, candle.close));
     const bodyBottom = yScale(Math.min(candle.open, candle.close));
     const bodyHeight = Math.max(2, bodyBottom - bodyTop);
     ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
   });
   
   // Pattern markers
   if (config.showPatterns !== false && config.detectedPatterns && config.detectedPatterns.length > 0) {
     config.detectedPatterns.forEach(pattern => {
       const patternTime = pattern.timestamp.getTime();
       const candleIdx = candles.findIndex(c => {
         const candleTime = c.time instanceof Date ? c.time.getTime() : c.time;
         return Math.abs(candleTime - patternTime) < 60000;
       });
       
       if (candleIdx >= 0 && candleIdx < candles.length) {
         const x = xScale(candleIdx);
         const candle = candles[candleIdx];
         const y = pattern.direction === 'CALL' ? yScale(candle.low) + 15 : yScale(candle.high) - 15;
         
         ctx.fillStyle = pattern.direction === 'CALL' ? '#00ff00' : '#ff4444';
         ctx.beginPath();
         if (pattern.direction === 'CALL') {
           ctx.moveTo(x, y - 8);
           ctx.lineTo(x - 5, y);
           ctx.lineTo(x + 5, y);
         } else {
           ctx.moveTo(x, y + 8);
           ctx.lineTo(x - 5, y);
           ctx.lineTo(x + 5, y);
         }
         ctx.closePath();
         ctx.fill();
       }
     });
   }
   
   // Entry line
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
   
   // Entry price label
   ctx.fillStyle = '#ffd700';
   ctx.font = 'bold 11px Arial, sans-serif';
   ctx.textAlign = 'left';
   ctx.fillText(`Entry: ${entryPrice.toFixed(pairConfig.decimals)}`, chartRight + 5, entryY + 4);
   
   // BUY/SELL arrow
   const arrowX = xScale(candles.length - 1) + candleSpacing * 0.8;
   const arrowColor = config.direction === 'CALL' ? '#00ff00' : '#ff0000';
   const arrowLabel = config.direction === 'CALL' ? 'BUY' : 'SELL';
   
   ctx.fillStyle = arrowColor;
   ctx.font = 'bold 14px Arial, sans-serif';
   ctx.textAlign = 'center';
   
   if (config.direction === 'CALL') {
     ctx.fillText(arrowLabel, arrowX, entryY - 35);
     ctx.strokeStyle = arrowColor;
     ctx.lineWidth = 2;
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
     ctx.strokeStyle = arrowColor;
     ctx.lineWidth = 2;
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
   
   // Price axis labels
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
   
   // Time axis labels
   ctx.textAlign = 'center';
   ctx.font = '11px Arial, sans-serif';
   
   for (let i = 0; i < candles.length; i += 5) {
     const candle = candles[i];
     const x = xScale(i);
     const candleTime = candle.time instanceof Date ? candle.time : new Date(candle.time);
     const timeStr = candleTime.toLocaleTimeString('en-US', { 
       hour: '2-digit', 
       minute: '2-digit',
       hour12: false 
     });
     ctx.fillText(timeStr, x, chartBottom + 20);
   }
   
   ctx.fillText('Time (M1)', chartLeft + chartWidth / 2, chartBottom + 45);
   
   // Legend box
   if (config.showIndicators !== false) {
     ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
     ctx.fillRect(chartLeft + 10, chartTop + 10, 100, 45);
     ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
     ctx.strokeRect(chartLeft + 10, chartTop + 10, 100, 45);
     
     ctx.strokeStyle = '#ff9800';
     ctx.lineWidth = 2;
     ctx.beginPath();
     ctx.moveTo(chartLeft + 20, chartTop + 25);
     ctx.lineTo(chartLeft + 40, chartTop + 25);
     ctx.stroke();
     ctx.fillStyle = '#ffffff';
     ctx.font = '11px Arial, sans-serif';
     ctx.textAlign = 'left';
     ctx.fillText('MA10', chartLeft + 45, chartTop + 29);
     
     ctx.strokeStyle = '#2196f3';
     ctx.lineWidth = 2;
     ctx.beginPath();
     ctx.moveTo(chartLeft + 20, chartTop + 42);
     ctx.lineTo(chartLeft + 40, chartTop + 42);
     ctx.stroke();
     ctx.fillStyle = '#ffffff';
     ctx.fillText('MA20', chartLeft + 45, chartTop + 46);
   }
   
   // Watermark
   ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
   ctx.font = 'bold 14px Arial, sans-serif';
   ctx.textAlign = 'right';
   ctx.fillText('TG: @TALHA_XYZ | TR TALHA PRO', width - 20, height - 15);
   
   // Data source indicator
   ctx.fillStyle = config.isRealData ? '#00ff00' : '#ff9800';
   ctx.font = 'bold 10px Arial, sans-serif';
   ctx.textAlign = 'left';
   ctx.fillText(config.isRealData ? '● LIVE DATA' : '○ SIMULATED', chartLeft + 10, height - 15);
   
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