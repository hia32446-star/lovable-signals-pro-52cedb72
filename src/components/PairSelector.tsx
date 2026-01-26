import { CurrencyPair } from '@/types/trading';
import { Zap } from 'lucide-react';

interface PairSelectorProps {
  title: string;
  icon: 'real' | 'otc';
  pairs: CurrencyPair[];
  onTogglePair: (symbol: string) => void;
}

export const PairSelector = ({ title, icon, pairs, onTogglePair }: PairSelectorProps) => {
  return (
    <div className="glass-panel p-4">
      <div className="flex items-center gap-2 mb-4">
        <Zap className={`w-5 h-5 ${icon === 'real' ? 'text-primary' : 'text-warning'}`} />
        <h3 className={`font-semibold ${icon === 'real' ? 'text-primary' : 'text-warning'}`}>
          {title}:
        </h3>
      </div>
      
      <div className="grid grid-cols-5 gap-2">
        {pairs.map((pair) => (
          <label
            key={pair.symbol}
            className="pair-checkbox"
          >
            <input
              type="checkbox"
              checked={pair.isActive}
              onChange={() => onTogglePair(pair.symbol)}
              className="accent-primary"
            />
            <span className={`text-sm ${pair.isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
              {pair.symbol.replace('-OTC', '')}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};
