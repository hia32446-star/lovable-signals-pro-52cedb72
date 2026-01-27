interface Candle {
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
}

export const generateChartImage = async (config: ChartConfig): Promise<Blob> => {
  const width = 800;
  const height = 500;
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  
  // Background gradient
  const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
  bgGradient.addColorStop(0, '#0a0f1a');
  bgGradient.addColorStop(1, '#0d1420');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);
  
  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const y = 60 + (i * (height - 120) / 10);
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.lineTo(width - 20, y);
    ctx.stroke();
  }
  for (let i = 0; i <= 20; i++) {
    const x = 50 + (i * (width - 70) / 20);
    ctx.beginPath();
    ctx.moveTo(x, 60);
    ctx.lineTo(x, height - 60);
    ctx.stroke();
  }
  
  // Generate candle data
  const candles: Candle[] = [];
  let basePrice = 1.0 + Math.random() * 0.5;
  
  for (let i = 0; i < 60; i++) {
    const volatility = 0.003 + Math.random() * 0.005;
    const trend = config.direction === 'CALL' 
      ? (i > 50 ? 0.6 : 0.45)
      : (i > 50 ? 0.4 : 0.55);
    const direction = Math.random() > trend ? 1 : -1;
    const change = direction * volatility;
    
    const open = basePrice;
    const close = open + change + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    
    candles.push({ open, high, low, close });
    basePrice = close;
  }
  
  // Calculate price range
  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const minPrice = Math.min(...allPrices) - 0.002;
  const maxPrice = Math.max(...allPrices) + 0.002;
  const priceRange = maxPrice - minPrice;
  
  const chartLeft = 50;
  const chartRight = width - 20;
  const chartTop = 60;
  const chartBottom = height - 60;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  
  const xScale = (i: number) => chartLeft + (i / (candles.length - 1)) * chartWidth;
  const yScale = (price: number) => chartTop + ((maxPrice - price) / priceRange) * chartHeight;
  
  const candleWidth = Math.max(6, (chartWidth / candles.length) * 0.7);
  
  // Calculate MAs
  const ma20: number[] = [];
  const ma50: number[] = [];
  
  candles.forEach((_, i) => {
    if (i >= 19) {
      const sum = candles.slice(i - 19, i + 1).reduce((acc, c) => acc + c.close, 0);
      ma20.push(sum / 20);
    }
    if (i >= 49) {
      const sum = candles.slice(i - 49, i + 1).reduce((acc, c) => acc + c.close, 0);
      ma50.push(sum / 50);
    }
  });
  
  // Draw MA50
  if (ma50.length > 1) {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ma50.forEach((price, i) => {
      const x = xScale(i + 49);
      const y = yScale(price);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  
  // Draw MA20
  if (ma20.length > 1) {
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ma20.forEach((price, i) => {
      const x = xScale(i + 19);
      const y = yScale(price);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  
  // Draw candles
  candles.forEach((candle, i) => {
    const x = xScale(i);
    const isGreen = candle.close >= candle.open;
    const color = isGreen ? '#22c55e' : '#ef4444';
    
    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yScale(candle.high));
    ctx.lineTo(x, yScale(candle.low));
    ctx.stroke();
    
    // Body
    ctx.fillStyle = color;
    const bodyTop = yScale(Math.max(candle.open, candle.close));
    const bodyHeight = Math.max(2, Math.abs(yScale(candle.open) - yScale(candle.close)));
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
  });
  
  // Signal arrow
  const lastCandle = candles[candles.length - 1];
  const arrowX = xScale(candles.length - 1) + 20;
  const arrowY = yScale(lastCandle.close);
  
  ctx.fillStyle = config.direction === 'CALL' ? '#22c55e' : '#ef4444';
  ctx.beginPath();
  if (config.direction === 'CALL') {
    ctx.moveTo(arrowX, arrowY + 15);
    ctx.lineTo(arrowX - 10, arrowY + 30);
    ctx.lineTo(arrowX + 10, arrowY + 30);
  } else {
    ctx.moveTo(arrowX, arrowY - 15);
    ctx.lineTo(arrowX - 10, arrowY - 30);
    ctx.lineTo(arrowX + 10, arrowY - 30);
  }
  ctx.closePath();
  ctx.fill();
  
  // Entry line
  ctx.strokeStyle = config.direction === 'CALL' ? '#22c55e' : '#ef4444';
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(chartLeft, arrowY);
  ctx.lineTo(chartRight, arrowY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Header
  ctx.fillStyle = '#f97316';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('🏆 BD TRADER PRO V5.0 🏆', width / 2, 30);
  
  // Pair info
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${config.pair}`, 60, 55);
  
  ctx.font = '14px monospace';
  ctx.fillStyle = '#9ca3af';
  ctx.fillText('M1 | Timeframe', 200, 55);
  
  // Direction badge
  const badgeX = width - 120;
  const badgeColor = config.direction === 'CALL' ? '#22c55e' : '#ef4444';
  ctx.fillStyle = badgeColor;
  ctx.beginPath();
  ctx.roundRect(badgeX - 40, 35, 100, 28, 5);
  ctx.fill();
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(config.direction === 'CALL' ? '🟢 CALL' : '🔴 PUT', badgeX + 10, 54);
  
  // Price info box
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(chartRight - 140, chartTop + 10, 130, 70, 5);
  ctx.fill();
  
  ctx.fillStyle = '#f97316';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Entry Price:', chartRight - 130, chartTop + 30);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`💋 ${config.price}`, chartRight - 130, chartTop + 50);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '11px monospace';
  ctx.fillText(`⏰ ${config.time}`, chartRight - 130, chartTop + 68);
  
  // Legend
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(chartLeft + 10, chartTop + 10, 100, 50, 5);
  ctx.fill();
  
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(chartLeft + 20, chartTop + 28);
  ctx.lineTo(chartLeft + 45, chartTop + 28);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '11px monospace';
  ctx.fillText('MA20', chartLeft + 50, chartTop + 32);
  
  ctx.strokeStyle = '#3b82f6';
  ctx.beginPath();
  ctx.moveTo(chartLeft + 20, chartTop + 45);
  ctx.lineTo(chartLeft + 45, chartTop + 45);
  ctx.stroke();
  ctx.fillText('MA50', chartLeft + 50, chartTop + 49);
  
  // Footer watermark
  ctx.fillStyle = 'rgba(249, 115, 22, 0.3)';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('TG: @X_Trader_Pro | BD TRADER PRO', width / 2, height - 15);
  
  // Price axis labels
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const price = maxPrice - (i / 5) * priceRange;
    const y = chartTop + (i / 5) * chartHeight;
    ctx.fillText(price.toFixed(4), chartLeft - 5, y + 4);
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
