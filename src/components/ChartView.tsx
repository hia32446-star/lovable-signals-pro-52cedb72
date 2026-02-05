 import { useState, useEffect, useMemo, useCallback } from 'react';
 import { Button } from '@/components/ui/button';
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
 import { Checkbox } from '@/components/ui/checkbox';
 import { RefreshCw, Camera, TrendingUp, Wifi, WifiOff, Download } from 'lucide-react';
 import { allPairs } from '@/data/currencyPairs';
 import { fetchMarketData, getApiStatus } from '@/utils/marketApi';
 import { analyzeCandlestickPatterns, PatternResult } from '@/utils/candlestickPatterns';
 import { generateChartWithRealData } from '@/utils/chartImageGenerator';
 import { toast } from 'sonner';
 
 interface Candle {
   time: number;
   open: number;
   high: number;
   low: number;
   close: number;
 }
 
 export const ChartView = () => {
   const [selectedPair, setSelectedPair] = useState('BRLUSD_otc');
   const [autoRefresh, setAutoRefresh] = useState(true);
   const [withSignal, setWithSignal] = useState(true);
   const [withResult, setWithResult] = useState(true);
   const [candles, setCandles] = useState<Candle[]>([]);
   const [isLoading, setIsLoading] = useState(false);
   const [isLiveData, setIsLiveData] = useState(false);
   const [detectedPatterns, setDetectedPatterns] = useState<PatternResult[]>([]);
   const [apiOnline, setApiOnline] = useState(true);
 
   // Generate simulated candle data (fallback)
   const generateCandles = (count: number = 100) => {
     const newCandles: Candle[] = [];
     let basePrice = 0.178 + Math.random() * 0.003;
     
     for (let i = 0; i < count; i++) {
       const volatility = 0.0005 + Math.random() * 0.001;
       const direction = Math.random() > 0.45 ? 1 : -1;
       const change = direction * volatility;
       
       const open = basePrice;
       const close = open + change + (Math.random() - 0.5) * volatility;
       const high = Math.max(open, close) + Math.random() * volatility * 0.5;
       const low = Math.min(open, close) - Math.random() * volatility * 0.5;
       
       newCandles.push({
         time: Date.now() - (count - i) * 60000,
         open,
         high,
         low,
         close,
       });
       
       basePrice = close;
     }
     return newCandles;
   };
 
   // Fetch real market data from API
   const fetchRealData = useCallback(async () => {
     setIsLoading(true);
     try {
       const data = await fetchMarketData(selectedPair);
       
       if (data && data.candles.length > 0) {
         const apiCandles: Candle[] = data.candles.map(c => ({
           time: c.time,
           open: c.open,
           high: c.high,
           low: c.low,
           close: c.close,
         }));
         
         setCandles(apiCandles.slice(-100));
         setIsLiveData(true);
         setApiOnline(true);
         
         // Analyze patterns
         const analysis = analyzeCandlestickPatterns(
           apiCandles.slice(-50).map(c => ({
             time: new Date(c.time),
             open: c.open,
             high: c.high,
             low: c.low,
             close: c.close,
           }))
         );
         setDetectedPatterns(analysis.patterns);
       } else {
         setCandles(generateCandles());
         setIsLiveData(false);
         setApiOnline(false);
         setDetectedPatterns([]);
       }
     } catch (error) {
       console.error('Failed to fetch real data:', error);
       setCandles(generateCandles());
       setIsLiveData(false);
       setApiOnline(false);
       setDetectedPatterns([]);
     } finally {
       setIsLoading(false);
     }
   }, [selectedPair]);
 
   useEffect(() => {
     fetchRealData();
   }, [fetchRealData]);
 
   useEffect(() => {
     if (!autoRefresh) return;
     
     const interval = setInterval(() => {
       fetchRealData();
     }, 60000); // Refresh every 60 seconds for M1 candles
     
     return () => clearInterval(interval);
   }, [autoRefresh, fetchRealData]);
 
   // Check API status periodically
   useEffect(() => {
     const checkStatus = () => {
       const status = getApiStatus();
       setApiOnline(status.success);
     };
     const interval = setInterval(checkStatus, 10000);
     return () => clearInterval(interval);
   }, []);
 
   // Download chart as image
   const handleDownloadChart = async () => {
     try {
       toast.info('Generating chart image...');
       const result = await generateChartWithRealData({
         pair: selectedPair,
         direction: 'CALL',
         price: candles[candles.length - 1]?.close.toString() || '0',
         time: new Date().toISOString(),
         entryTime: new Date(),
       });
       
       const url = URL.createObjectURL(result.blob);
       const a = document.createElement('a');
       a.href = url;
       a.download = `${selectedPair}_chart_${Date.now()}.png`;
       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);
       URL.revokeObjectURL(url);
       
       toast.success(`Chart saved! ${result.usedRealData ? '(Live Data)' : '(Simulated)'}`);
     } catch (error) {
       console.error('Failed to generate chart:', error);
       toast.error('Failed to generate chart image');
     }
   };
 
   // Calculate moving averages
   const { ma20, ma50, support, resistance } = useMemo(() => {
     const ma20: number[] = [];
     const ma50: number[] = [];
     
     candles.forEach((_, i) => {
       if (i >= 19) {
         const sum20 = candles.slice(i - 19, i + 1).reduce((acc, c) => acc + c.close, 0);
         ma20.push(sum20 / 20);
       }
       if (i >= 49) {
         const sum50 = candles.slice(i - 49, i + 1).reduce((acc, c) => acc + c.close, 0);
         ma50.push(sum50 / 50);
       }
     });
     
     const allPrices = candles.flatMap(c => [c.high, c.low]);
     const support = Math.min(...allPrices);
     const resistance = Math.max(...allPrices);
     
     return { ma20, ma50, support, resistance };
   }, [candles]);
 
   // Chart dimensions
   const chartWidth = 1100;
   const chartHeight = 450;
   const padding = { top: 40, right: 80, bottom: 50, left: 60 };
   const plotWidth = chartWidth - padding.left - padding.right;
   const plotHeight = chartHeight - padding.top - padding.bottom;
 
   // Price range
   const allPrices = candles.flatMap(c => [c.high, c.low]);
   const minPrice = Math.min(...allPrices) - 0.0005;
   const maxPrice = Math.max(...allPrices) + 0.0005;
   const priceRange = maxPrice - minPrice;
 
   // Scale functions
   const xScale = (i: number) => padding.left + (i / (candles.length - 1)) * plotWidth;
   const yScale = (price: number) => padding.top + ((maxPrice - price) / priceRange) * plotHeight;
 
   const candleWidth = Math.max(4, (plotWidth / candles.length) * 0.7);
 
   return (
     <div className="space-y-4">
       {/* Header */}
       <div className="glass-panel p-4 flex items-center justify-between">
         <div className="flex items-center gap-4">
           <div className="flex items-center gap-2">
             <TrendingUp className="w-6 h-6 text-primary" />
             <span className="font-bold text-primary text-lg">
               {isLiveData ? 'LIVE MARKET' : 'VIRTUAL MARKET'}
             </span>
             {apiOnline ? (
               <Wifi className="w-4 h-4 text-green-500" />
             ) : (
               <WifiOff className="w-4 h-4 text-red-500" />
             )}
           </div>
           
           <div className="flex items-center gap-2">
             <span className="text-muted-foreground">Pair:</span>
             <Select value={selectedPair} onValueChange={setSelectedPair}>
               <SelectTrigger className="w-[160px] bg-secondary">
                 <SelectValue />
               </SelectTrigger>
               <SelectContent>
                 {allPairs.filter(p => p.isActive).map(pair => (
                   <SelectItem key={pair.symbol} value={pair.symbol}>
                     {pair.symbol}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>
 
           <div className="flex items-center gap-2">
             <Checkbox
               id="auto-refresh"
               checked={autoRefresh}
               onCheckedChange={(checked) => setAutoRefresh(checked as boolean)}
             />
             <label htmlFor="auto-refresh" className="text-sm">Auto-Refresh (60s)</label>
           </div>
         </div>
 
         <div className="flex items-center gap-4">
           <div className="flex items-center gap-2">
             <Camera className="w-4 h-4 text-accent" />
             <span className="text-accent font-medium">Screenshot:</span>
           </div>
           
           <div className="flex items-center gap-2">
             <Checkbox
               id="with-signal"
               checked={withSignal}
               onCheckedChange={(checked) => setWithSignal(checked as boolean)}
             />
             <label htmlFor="with-signal" className="text-sm">With Signal</label>
           </div>
 
           <div className="flex items-center gap-2">
             <Checkbox
               id="with-result"
               checked={withResult}
               onCheckedChange={(checked) => setWithResult(checked as boolean)}
             />
             <label htmlFor="with-result" className="text-sm">With Result</label>
           </div>
 
           <Button 
             variant="outline" 
             className="gap-2 bg-primary/20 hover:bg-primary/30 border-primary/50 text-primary"
             onClick={handleDownloadChart}
           >
             <Download className="w-4 h-4" />
             Save Chart
           </Button>
 
           <Button 
             variant="outline" 
             className="gap-2 bg-accent/20 hover:bg-accent/30 border-accent/50 text-accent"
             onClick={fetchRealData}
             disabled={isLoading}
           >
             <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
             {isLoading ? 'Loading...' : 'Refresh Now'}
           </Button>
         </div>
       </div>
 
       {/* Chart */}
       <div className="glass-panel p-4">
         <div className="text-center mb-4">
           <h2 className="text-xl font-bold text-accent">
             {selectedPair} - M1 Candlestick Chart
           </h2>
           {detectedPatterns.length > 0 && (
             <p className={`text-sm font-medium ${detectedPatterns[0].direction === 'CALL' ? 'text-green-500' : 'text-red-500'}`}>
               Pattern: {detectedPatterns[0].pattern} ({Math.round(detectedPatterns[0].confidence * 100)}% confidence)
             </p>
           )}
           <p className="text-xs text-muted-foreground">
             {isLiveData ? '🔴 Live Data' : '📊 Simulated Data'} • {candles.length} candles
           </p>
         </div>
         
         <svg width={chartWidth} height={chartHeight} className="mx-auto">
           {/* Grid lines */}
           {Array.from({ length: 6 }).map((_, i) => {
             const y = padding.top + (i / 5) * plotHeight;
             const price = maxPrice - (i / 5) * priceRange;
             return (
               <g key={i}>
                 <line
                   x1={padding.left}
                   y1={y}
                   x2={chartWidth - padding.right}
                   y2={y}
                   stroke="hsl(var(--border))"
                   strokeDasharray="2,4"
                 />
                 <text
                   x={padding.left - 10}
                   y={y + 4}
                   textAnchor="end"
                   className="fill-muted-foreground text-xs"
                 >
                   {price.toFixed(5)}
                 </text>
               </g>
             );
           })}
 
           {/* X-axis labels */}
           {Array.from({ length: 6 }).map((_, i) => {
             const x = padding.left + (i / 5) * plotWidth;
             const candleIdx = Math.round((i / 5) * (candles.length - 1));
             const candle = candles[candleIdx];
             const timeLabel = candle ? new Date(candle.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
             return (
               <text
                 key={i}
                 x={x}
                 y={chartHeight - 20}
                 textAnchor="middle"
                 className="fill-muted-foreground text-xs"
               >
                 {timeLabel}
               </text>
             );
           })}
           
           <text
             x={chartWidth / 2}
             y={chartHeight - 5}
             textAnchor="middle"
             className="fill-muted-foreground text-sm"
           >
             Time (M1)
           </text>
           
           <text
             x={15}
             y={chartHeight / 2}
             textAnchor="middle"
             transform={`rotate(-90, 15, ${chartHeight / 2})`}
             className="fill-muted-foreground text-sm"
           >
             Price
           </text>
 
           {/* Support & Resistance lines */}
           <line
             x1={padding.left}
             y1={yScale(resistance)}
             x2={chartWidth - padding.right}
             y2={yScale(resistance)}
             stroke="hsl(var(--destructive))"
             strokeDasharray="6,4"
             strokeWidth={1.5}
           />
           <line
             x1={padding.left}
             y1={yScale(support)}
             x2={chartWidth - padding.right}
             y2={yScale(support)}
             stroke="hsl(var(--success))"
             strokeDasharray="6,4"
             strokeWidth={1.5}
           />
 
           {/* MA20 line */}
           <path
             d={ma20.map((price, i) => {
               const x = xScale(i + 19);
               const y = yScale(price);
               return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
             }).join(' ')}
             fill="none"
             stroke="hsl(var(--chart-orange))"
             strokeWidth={1.5}
           />
 
           {/* MA50 line */}
           <path
             d={ma50.map((price, i) => {
               const x = xScale(i + 49);
               const y = yScale(price);
               return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
             }).join(' ')}
             fill="none"
             stroke="hsl(var(--chart-blue))"
             strokeWidth={1.5}
           />
 
           {/* Candles */}
           {candles.map((candle, i) => {
             const x = xScale(i);
             const isGreen = candle.close >= candle.open;
             const color = isGreen ? 'hsl(var(--chart-green))' : 'hsl(var(--chart-red))';
             
             return (
               <g key={i}>
                 {/* Wick */}
                 <line
                   x1={x}
                   y1={yScale(candle.high)}
                   x2={x}
                   y2={yScale(candle.low)}
                   stroke={color}
                   strokeWidth={1}
                 />
                 {/* Body */}
                 <rect
                   x={x - candleWidth / 2}
                   y={yScale(Math.max(candle.open, candle.close))}
                   width={candleWidth}
                   height={Math.max(1, Math.abs(yScale(candle.open) - yScale(candle.close)))}
                   fill={color}
                 />
               </g>
             );
           })}
 
           {/* Legend */}
           <g transform={`translate(${padding.left + 10}, ${padding.top + 10})`}>
             <rect x={0} y={0} width={130} height={80} fill="hsl(var(--card))" fillOpacity={0.9} rx={4} />
             <line x1={10} y1={18} x2={35} y2={18} stroke="hsl(var(--chart-orange))" strokeWidth={2} />
             <text x={40} y={22} className="fill-foreground text-xs">MA20</text>
             
             <line x1={10} y1={38} x2={35} y2={38} stroke="hsl(var(--chart-blue))" strokeWidth={2} />
             <text x={40} y={42} className="fill-foreground text-xs">MA50</text>
             
             <line x1={10} y1={58} x2={35} y2={58} stroke="hsl(var(--destructive))" strokeWidth={2} strokeDasharray="4,2" />
             <text x={40} y={62} className="fill-foreground text-xs">Resistance</text>
             
             <line x1={10} y1={78} x2={35} y2={78} stroke="hsl(var(--success))" strokeWidth={2} strokeDasharray="4,2" />
             <text x={40} y={82} className="fill-foreground text-xs">Support</text>
           </g>
 
           {/* Watermark */}
           <text
             x={chartWidth - padding.right - 10}
             y={padding.top + 20}
             textAnchor="end"
             className="fill-primary/30 text-sm font-bold"
           >
             TR TALHA PRO
           </text>
           <text
             x={chartWidth - padding.right - 10}
             y={padding.top + 38}
             textAnchor="end"
             className="fill-primary/20 text-xs"
           >
             TG: @TALHA_XYZ
           </text>
         </svg>
       </div>
     </div>
   );
 };