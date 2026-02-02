-- Create signals table for persistent tracking
CREATE TABLE public.signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signal_id TEXT NOT NULL UNIQUE,
  pair TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('CALL', 'PUT')),
  entry_time TIMESTAMP WITH TIME ZONE NOT NULL,
  resolve_time TIMESTAMP WITH TIME ZONE,
  confidence INTEGER NOT NULL,
  strategy TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'win', 'loss', 'mtg')),
  entry_price DECIMAL(20, 8),
  exit_price DECIMAL(20, 8),
  price_diff DECIMAL(20, 8),
  mtg_step INTEGER DEFAULT 0,
  data_source TEXT DEFAULT 'simulated' CHECK (data_source IN ('live', 'simulated')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create daily stats table for aggregated performance
CREATE TABLE public.daily_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  mtg_wins INTEGER NOT NULL DEFAULT 0,
  total_signals INTEGER NOT NULL DEFAULT 0,
  win_rate DECIMAL(5, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pair stats table for per-pair performance
CREATE TABLE public.pair_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pair TEXT NOT NULL UNIQUE,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  total_signals INTEGER NOT NULL DEFAULT 0,
  win_rate DECIMAL(5, 2) DEFAULT 0,
  last_signal_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_signals_pair ON public.signals(pair);
CREATE INDEX idx_signals_status ON public.signals(status);
CREATE INDEX idx_signals_entry_time ON public.signals(entry_time DESC);
CREATE INDEX idx_signals_created_at ON public.signals(created_at DESC);
CREATE INDEX idx_daily_stats_date ON public.daily_stats(date DESC);

-- Enable RLS but allow public access (no auth required for this bot)
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pair_stats ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (bot operates without user auth)
CREATE POLICY "Allow public read signals" ON public.signals FOR SELECT USING (true);
CREATE POLICY "Allow public insert signals" ON public.signals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update signals" ON public.signals FOR UPDATE USING (true);

CREATE POLICY "Allow public read daily_stats" ON public.daily_stats FOR SELECT USING (true);
CREATE POLICY "Allow public insert daily_stats" ON public.daily_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update daily_stats" ON public.daily_stats FOR UPDATE USING (true);

CREATE POLICY "Allow public read pair_stats" ON public.pair_stats FOR SELECT USING (true);
CREATE POLICY "Allow public insert pair_stats" ON public.pair_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update pair_stats" ON public.pair_stats FOR UPDATE USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_signals_updated_at
  BEFORE UPDATE ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_daily_stats_updated_at
  BEFORE UPDATE ON public.daily_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pair_stats_updated_at
  BEFORE UPDATE ON public.pair_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();