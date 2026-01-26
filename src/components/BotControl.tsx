import { Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BotControlProps {
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
}

export const BotControl = ({ isRunning, onStart, onStop }: BotControlProps) => {
  return (
    <Button
      onClick={isRunning ? onStop : onStart}
      className={`w-full h-14 text-lg font-bold transition-all duration-300 ${
        isRunning
          ? 'bg-gradient-to-r from-destructive to-accent hover:from-destructive/90 hover:to-accent/90 glow-accent'
          : 'bg-gradient-to-r from-success to-primary hover:from-success/90 hover:to-primary/90 glow-success'
      }`}
    >
      {isRunning ? (
        <>
          <Square className="w-5 h-5 mr-2" />
          STOP BOT
        </>
      ) : (
        <>
          <Play className="w-5 h-5 mr-2" />
          START BOT
        </>
      )}
    </Button>
  );
};
