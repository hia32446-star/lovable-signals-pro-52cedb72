import { supabase } from '@/integrations/supabase/client';
import { Signal, SignalDirection, PairStats, TradingStats } from '@/types/trading';

export interface DbSignal {
  id: string;
  signal_id: string;
  pair: string;
  direction: string;
  entry_time: string;
  resolve_time: string | null;
  confidence: number;
  strategy: string;
  status: string;
  entry_price: number | null;
  exit_price: number | null;
  price_diff: number | null;
  mtg_step: number;
  data_source: string;
  created_at: string;
  updated_at: string;
}

export interface DbDailyStats {
  id: string;
  date: string;
  wins: number;
  losses: number;
  mtg_wins: number;
  total_signals: number;
  win_rate: number;
}

export interface DbPairStats {
  id: string;
  pair: string;
  wins: number;
  losses: number;
  total_signals: number;
  win_rate: number;
  last_signal_at: string | null;
}

// Convert DB signal to app Signal type
export const dbSignalToSignal = (db: DbSignal): Signal => ({
  id: db.signal_id,
  pair: db.pair,
  direction: db.direction as SignalDirection,
  entryTime: new Date(db.entry_time),
  confidence: db.confidence,
  strategy: db.strategy,
  status: db.status as Signal['status'],
  openPrice: db.entry_price ?? undefined,
  closePrice: db.exit_price ?? undefined,
  mtgStep: db.mtg_step,
  dataSource: (db.data_source as 'live' | 'simulated') || 'simulated',
});

// Save a new signal to the database
export const saveSignal = async (
  signal: Signal,
  entryPrice: number | null,
  dataSource: 'live' | 'simulated'
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('signals')
      .insert({
        signal_id: signal.id,
        pair: signal.pair,
        direction: signal.direction,
        entry_time: signal.entryTime.toISOString(),
        confidence: signal.confidence,
        strategy: signal.strategy,
        status: signal.status,
        entry_price: entryPrice,
        mtg_step: signal.mtgStep || 0,
        data_source: dataSource,
      });

    if (error) {
      console.error('Error saving signal:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error saving signal:', err);
    return false;
  }
};

// Update signal result in database
export const updateSignalResult = async (
  signalId: string,
  status: Signal['status'],
  exitPrice: number | null,
  priceDiff: number | null,
  dataSource: 'live' | 'simulated'
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('signals')
      .update({
        status,
        exit_price: exitPrice,
        price_diff: priceDiff,
        resolve_time: new Date().toISOString(),
        data_source: dataSource,
      })
      .eq('signal_id', signalId);

    if (error) {
      console.error('Error updating signal result:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error updating signal result:', err);
    return false;
  }
};

// Update daily stats
export const updateDailyStats = async (
  status: 'win' | 'loss' | 'mtg'
): Promise<boolean> => {
  const today = new Date().toISOString().split('T')[0];

  try {
    // Get current stats for today
    const { data: existing } = await supabase
      .from('daily_stats')
      .select('*')
      .eq('date', today)
      .single();

    if (existing) {
      // Update existing
      const wins = status === 'win' ? existing.wins + 1 : existing.wins;
      const mtgWins = status === 'mtg' ? existing.mtg_wins + 1 : existing.mtg_wins;
      const losses = status === 'loss' ? existing.losses + 1 : existing.losses;
      const totalWins = wins + mtgWins;
      const totalDecided = totalWins + losses;
      const winRate = totalDecided > 0 ? (totalWins / totalDecided) * 100 : 0;

      const { error } = await supabase
        .from('daily_stats')
        .update({
          wins,
          mtg_wins: mtgWins,
          losses,
          total_signals: existing.total_signals + 1,
          win_rate: winRate,
        })
        .eq('date', today);

      if (error) {
        console.error('Error updating daily stats:', error);
        return false;
      }
    } else {
      // Insert new record
      const wins = status === 'win' ? 1 : 0;
      const mtgWins = status === 'mtg' ? 1 : 0;
      const losses = status === 'loss' ? 1 : 0;
      const totalWins = wins + mtgWins;
      const winRate = totalWins > 0 ? 100 : 0;

      const { error } = await supabase
        .from('daily_stats')
        .insert({
          date: today,
          wins,
          mtg_wins: mtgWins,
          losses,
          total_signals: 1,
          win_rate: winRate,
        });

      if (error) {
        console.error('Error inserting daily stats:', error);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error('Error updating daily stats:', err);
    return false;
  }
};

// Update pair stats
export const updatePairStats = async (
  pair: string,
  status: 'win' | 'loss' | 'mtg'
): Promise<PairStats> => {
  try {
    // Get current pair stats
    const { data: existing } = await supabase
      .from('pair_stats')
      .select('*')
      .eq('pair', pair)
      .single();

    const isWin = status === 'win' || status === 'mtg';
    
    if (existing) {
      const wins = isWin ? existing.wins + 1 : existing.wins;
      const losses = !isWin ? existing.losses + 1 : existing.losses;
      const totalDecided = wins + losses;
      const winRate = totalDecided > 0 ? (wins / totalDecided) * 100 : 0;

      await supabase
        .from('pair_stats')
        .update({
          wins,
          losses,
          total_signals: existing.total_signals + 1,
          win_rate: winRate,
          last_signal_at: new Date().toISOString(),
        })
        .eq('pair', pair);

      return { wins, losses };
    } else {
      const wins = isWin ? 1 : 0;
      const losses = !isWin ? 1 : 0;

      await supabase
        .from('pair_stats')
        .insert({
          pair,
          wins,
          losses,
          total_signals: 1,
          win_rate: isWin ? 100 : 0,
          last_signal_at: new Date().toISOString(),
        });

      return { wins, losses };
    }
  } catch (err) {
    console.error('Error updating pair stats:', err);
    return { wins: 0, losses: 0 };
  }
};

// Fetch recent signals
export const fetchRecentSignals = async (limit: number = 50): Promise<Signal[]> => {
  try {
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching signals:', error);
      return [];
    }

    return (data as DbSignal[]).map(dbSignalToSignal);
  } catch (err) {
    console.error('Error fetching signals:', err);
    return [];
  }
};

// Fetch today's stats
export const fetchTodayStats = async (): Promise<TradingStats | null> => {
  const today = new Date().toISOString().split('T')[0];

  try {
    const { data, error } = await supabase
      .from('daily_stats')
      .select('*')
      .eq('date', today)
      .single();

    if (error || !data) {
      return null;
    }

    const stats = data as DbDailyStats;
    return {
      wins: stats.wins,
      losses: stats.losses,
      mtgWins: stats.mtg_wins,
      winRate: stats.win_rate,
      totalSignals: stats.total_signals,
      activeSignals: 0, // Will be calculated from active signals
    };
  } catch (err) {
    console.error('Error fetching today stats:', err);
    return null;
  }
};

// Fetch all pair stats
export const fetchAllPairStats = async (): Promise<Map<string, PairStats>> => {
  try {
    const { data, error } = await supabase
      .from('pair_stats')
      .select('*');

    if (error) {
      console.error('Error fetching pair stats:', error);
      return new Map();
    }

    const statsMap = new Map<string, PairStats>();
    (data as DbPairStats[]).forEach(ps => {
      statsMap.set(ps.pair, { wins: ps.wins, losses: ps.losses });
    });

    return statsMap;
  } catch (err) {
    console.error('Error fetching pair stats:', err);
    return new Map();
  }
};

// Get pair stats for a specific pair
export const getPairStats = async (pair: string): Promise<PairStats> => {
  try {
    const { data, error } = await supabase
      .from('pair_stats')
      .select('*')
      .eq('pair', pair)
      .single();

    if (error || !data) {
      return { wins: 0, losses: 0 };
    }

    const stats = data as DbPairStats;
    return { wins: stats.wins, losses: stats.losses };
  } catch (err) {
    return { wins: 0, losses: 0 };
  }
};

// Fetch historical stats for analysis
export const fetchHistoricalStats = async (days: number = 30): Promise<DbDailyStats[]> => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from('daily_stats')
      .select('*')
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching historical stats:', error);
      return [];
    }

    return data as DbDailyStats[];
  } catch (err) {
    console.error('Error fetching historical stats:', err);
    return [];
  }
};

// Count active signals
export const countActiveSignals = async (): Promise<number> => {
  try {
    const { count, error } = await supabase
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    if (error) {
      console.error('Error counting active signals:', error);
      return 0;
    }

    return count || 0;
  } catch (err) {
    console.error('Error counting active signals:', err);
    return 0;
  }
};
