export type MarketType = 'real' | 'otc';
export type SignalDirection = 'CALL' | 'PUT';
export type SignalStatus = 'pending' | 'active' | 'win' | 'loss' | 'mtg' | 'mtg_pending';

export interface CurrencyPair {
  symbol: string;
  name: string;
  marketType: MarketType;
  isActive: boolean;
}

export interface Signal {
  id: string;
  pair: string;
  direction: SignalDirection;
  entryTime: Date;
  confidence: number;
  strategy: string;
  status: SignalStatus;
  openPrice?: number;
  closePrice?: number;
  mtgStep?: number;
  dataSource?: 'live' | 'simulated';
}

export interface TradingStats {
  wins: number;
  losses: number;
  mtgWins: number;
  winRate: number;
  totalSignals: number;
  activeSignals: number;
}

export interface ActivityLog {
  id: string;
  timestamp: Date;
  type: 'info' | 'win' | 'loss' | 'signal' | 'mtg' | 'error';
  message: string;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  isEnabled: boolean;
}

export interface Indicator {
  name: string;
  params: string;
  isActive: boolean;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  accuracy: number;
  isActive: boolean;
}

export interface PairStats {
  wins: number;
  losses: number;
}
