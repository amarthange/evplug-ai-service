import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from './ui/dialog';
import { Button } from './ui/button';
import { 
  CarbonImpactData, 
  exportSVGtoPNGWithFallback, 
  shareOrDownload,
  generateShareSVG 
} from '../lib/carbon-share-engine';
import { CarbonShareCard } from './CarbonShareCard';
import { 
  Share2, 
  Download, 
  CheckCircle2, 
  Loader2, 
  AlertCircle,
  Leaf
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CarbonShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: CarbonImpactData;
}

export const CarbonShareModal: React.FC<CarbonShareModalProps> = ({
  isOpen,
  onClose,
  data
}) => {
  const [status, setStatus] = useState<'idle' | 'generating' | 'ready' | 'sharing' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);

  // Auto-generate the PNG on open to satisfy iOS Safari user-gesture requirements
  // We want the blob ready BEFORE they tap "Share"
  useEffect(() => {
    if (isOpen && status === 'idle') {
      generateImage();
    }
  }, [isOpen]);

  const generateImage = async () => {
    setStatus('generating');
    try {
      const svg = generateShareSVG(data);
      const { blob } = await exportSVGtoPNGWithFallback(svg);
      setImageBlob(blob);
      setStatus('ready');
    } catch (err: any) {
      console.error('[SeniorDevOps Share] Generation error:', err);
      setError(err.message || 'Failed to generate share image');
      setStatus('error');
    }
  };

  const handleAction = async () => {
    if (!imageBlob) return;
    
    setStatus('sharing');
    try {
      const result = await shareOrDownload(imageBlob, data);
      if (result.success) {
        setStatus('done');
        // Close after a brief delay to show success state
        setTimeout(() => {
          onClose();
          setStatus('idle');
        }, 2000);
      } else {
        setStatus('ready'); // Revert to ready if they cancelled the share sheet
      }
    } catch (err: any) {
      setError(err.message || 'Sharing failed');
      setStatus('error');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px] bg-emerald-950 text-white border-emerald-900 overflow-hidden p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-emerald-400">
            <Leaf className="w-5 h-5" />
            Share Your Impact
          </DialogTitle>
          <DialogDescription className="text-emerald-300/70">
            Show the world how you're driving the change.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4">
          <div className="relative group">
            <CarbonShareCard data={data} className="scale-[0.85] -my-10" />
            
            <AnimatePresence>
              {(status === 'generating' || status === 'sharing') && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-emerald-950/60 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl z-10"
                >
                  <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-2" />
                  <p className="text-sm font-medium text-emerald-100">
                    {status === 'generating' ? 'Preparing your card...' : 'Opening share sheet...'}
                  </p>
                </motion.div>
              )}

              {status === 'done' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute inset-0 bg-emerald-900/80 backdrop-blur-md flex flex-col items-center justify-center rounded-xl z-10"
                >
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2" />
                  <p className="text-lg font-bold text-white">Impact Shared!</p>
                  <p className="text-sm text-emerald-200">Keep up the green miles.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <DialogFooter className="p-6 bg-emerald-900/30 flex flex-col sm:flex-row gap-2 mt-2">
          {status === 'error' ? (
            <div className="flex flex-col w-full gap-3">
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
              <Button 
                onClick={generateImage} 
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-emerald-950"
              >
                Retry Generation
              </Button>
            </div>
          ) : (
            <>
              <Button 
                variant="outline" 
                onClick={onClose}
                className="flex-1 border-emerald-800 text-emerald-100 hover:bg-emerald-900 hover:text-white"
              >
                Close
              </Button>
              <Button 
                onClick={handleAction}
                disabled={status !== 'ready'}
                className="flex-[2] bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-bold"
              >
                {status === 'ready' ? (
                  <>
                    <Share2 className="w-4 h-4 mr-2" />
                    Share / Download
                  </>
                ) : (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
