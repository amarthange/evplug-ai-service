import { useState, useRef, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { detectVoiceSupport, listenForCommand } from '@/lib/voice-commander';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  lang?: string;
  className?: string;
}

export default function VoiceInputButton({ onTranscript, onError, disabled, lang = 'en-IN', className }: VoiceInputButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const support = detectVoiceSupport();

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  if (support !== 'supported') {
    return null;
  }

  async function handlePress() {
    if (isListening) {
      abortRef.current?.abort();
      setIsListening(false);
      return;
    }

    abortRef.current = new AbortController();
    setIsListening(true);
    
    const result = await listenForCommand(abortRef.current.signal, lang);
    setIsListening(false);
    
    if (result.success) {
      onTranscript(result.transcript);
      // Optional: Handle confidence indicator here if needed, but since it's auto-submit, we don't strictly need it in the button state
    } else if (result.errorType !== 'aborted') {
      onError(result.message);
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handlePress}
            disabled={disabled}
            className={cn(
              "rounded-full transition-all duration-300 relative",
              isListening ? "bg-red-500/10 hover:bg-red-500/20 text-red-500" : "text-muted-foreground hover:text-primary",
              className
            )}
          >
            {isListening ? (
              <div className="flex items-center justify-center gap-[2px] h-4 w-4">
                <div className="w-1 h-3 bg-red-500 rounded-full animate-[pulse_1s_ease-in-out_infinite]" />
                <div className="w-1 h-4 bg-red-500 rounded-full animate-[pulse_1.2s_ease-in-out_infinite_0.1s]" />
                <div className="w-1 h-2 bg-red-500 rounded-full animate-[pulse_0.8s_ease-in-out_infinite_0.2s]" />
              </div>
            ) : (
              <Mic className="w-5 h-5" />
            )}
            
            {/* Pulsing ring when listening */}
            {isListening && (
              <span className="absolute inset-0 rounded-full border-2 border-red-500/30 animate-ping" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {isListening ? 'Tap to cancel' : 'Voice input'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
