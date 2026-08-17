import React, { useRef, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Share2, Download, Loader2, Check } from 'lucide-react';
import { SessionShareCard } from './SessionShareCard';
import { exportSessionCardBlob, type SessionShareData } from '@/lib/session-share-engine';
import { useToast } from '@/hooks/use-toast';

interface SessionShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionShareData | null;
}

export default function SessionShareModal({ isOpen, onClose, session }: SessionShareModalProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [hasShared, setHasShared] = useState(false);
  const blobRef = useRef<Blob | null>(null);

  // Pre-generate blob for iOS Safari compatibility
  // navigator.share() must be called in a direct response to user gesture.
  // Generating the blob *during* the click often misses the window on iOS.
  useEffect(() => {
    if (!isOpen || !session) {
      blobRef.current = null;
      setHasShared(false);
      return;
    }

    const preGenerate = async () => {
      setIsGenerating(true);
      try {
        const blob = await exportSessionCardBlob(session);
        blobRef.current = blob;
      } catch (err) {
        console.error('[EVPlugFinder] Blob generation failed:', err);
      } finally {
        setIsGenerating(false);
      }
    };

    preGenerate();
  }, [isOpen, session]);

  const handleShare = async () => {
    if (!blobRef.current || !session) return;
    
    setIsSharing(true);
    try {
      const file = new File([blobRef.current], `evplugfinder-session-${Date.now()}.png`, { type: 'image/png' });
      
      // Check if Web Share API is available and supports files
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My EVPlugFinder Charging Session',
          text: `Check out my charging session at ${session.stationName}! Powered by EVPlugFinder.`
        });
        setHasShared(true);
      } else {
        // Fallback: Trigger Download
        triggerDownload();
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast({
          variant: "destructive",
          title: "Sharing Failed",
          description: "Could not share the image. Downloading instead."
        });
        triggerDownload();
      }
    } finally {
      setIsSharing(false);
    }
  };

  const triggerDownload = () => {
    if (!blobRef.current) return;
    const url = URL.createObjectURL(blobRef.current);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evplugfinder-session-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Saved to Photos",
      description: "Your session summary has been downloaded."
    });
  };

  if (!session) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-slate-950/95 backdrop-blur-2xl border-white/10 p-0 overflow-hidden rounded-[32px]">
        <div className="p-8 pb-4">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-white text-center">Share Session</DialogTitle>
            <DialogDescription className="text-slate-400 text-center text-xs font-bold uppercase tracking-widest mt-2">
              Flex your charging impact
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-4 bg-white/5">
          <SessionShareCard data={session} />
        </div>

        <div className="p-8 flex flex-col gap-3">
          <Button 
            className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black text-lg gap-3 transition-all active:scale-[0.98]"
            onClick={handleShare}
            disabled={isGenerating || isSharing}
          >
            {isSharing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : hasShared ? (
              <>Shared <Check className="w-5 h-5" /></>
            ) : (
              <>Share Summary <Share2 className="w-5 h-5" /></>
            )}
          </Button>

          <Button 
            variant="ghost"
            className="w-full h-12 rounded-2xl text-slate-400 hover:text-white hover:bg-white/5 font-bold gap-2"
            onClick={triggerDownload}
            disabled={isGenerating}
          >
            <Download className="w-4 h-4" /> Download PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
