import { Rocket, User, ChevronRight, BarChart3, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  currentView: 'main' | 'analysis' | 'chart';
  onViewChange: (view: 'main' | 'analysis' | 'chart') => void;
  isOnline: boolean;
}

export const Header = ({ currentView, onViewChange, isOnline }: HeaderProps) => {
  return (
    <header className="glass-panel px-6 py-3 flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-primary">
          <Rocket className="w-6 h-6 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          BD TRADER PRO V5.0
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success animate-pulse-glow' : 'bg-destructive'}`} />
          <span className={`text-sm font-medium ${isOnline ? 'text-success' : 'text-destructive'}`}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-lg">
          <User className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">x_trader_pro</span>
        </div>

        <Button
          variant={currentView === 'main' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('main')}
          className="gap-2"
        >
          <ChevronRight className="w-4 h-4" />
          NEXT
        </Button>

        <Button
          variant={currentView === 'analysis' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('analysis')}
          className="gap-2 bg-success/20 hover:bg-success/30 border-success/50 text-success"
        >
          <BarChart3 className="w-4 h-4" />
          Partial
        </Button>

        <Button
          variant={currentView === 'chart' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('chart')}
          className="gap-2 bg-primary/20 hover:bg-primary/30 border-primary/50 text-primary"
        >
          <BarChart3 className="w-4 h-4" />
          Chart
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-2 bg-destructive/20 hover:bg-destructive/30 border-destructive/50 text-destructive"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>
    </header>
  );
};
