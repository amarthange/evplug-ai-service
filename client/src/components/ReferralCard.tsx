import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Share2, Copy, Users, Check, Gift } from 'lucide-react';
import { Firestore, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { generateReferralCode, shareReferralLink } from '@/lib/referral-engine';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ReferralCardProps {
  userId: string;
  db: Firestore;
}

export default function ReferralCard({ userId, db }: ReferralCardProps) {
  const [shareResult, setShareResult] = useState<'shared' | 'copied' | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const generatedCode = useMemo(() => generateReferralCode(userId), [userId]);

  const { data: stats } = useQuery({
    queryKey: ['referral-stats', userId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'users', userId));
      const data = snap.data();
      return {
        referralCount: data?.referralCount ?? 0,
        referralCode: data?.referralCode ?? generatedCode
      };
    },
    staleTime: 5 * 60 * 1000
  });

  const referralCode = stats?.referralCode || generatedCode;
  const referralCount = stats?.referralCount || 0;

  useEffect(() => {
    const ensureCode = async () => {
      try {
        await updateDoc(doc(db, 'users', userId), {
          referralCode
        });
      } catch (e) {
        // Since we are not using merge true in updateDoc natively,
        // it acts as a merge by default on an existing document.
      }
    };
    ensureCode();
  }, [userId, referralCode, db]);

  const handleShare = async () => {
    const result = await shareReferralLink(referralCode);
    setShareResult(result);
    setTimeout(() => setShareResult(null), 2000);
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(referralCode);
    setShareResult('copied');
    setTimeout(() => setShareResult(null), 2000);
  };

  return (
    <Card className="premium-glass p-6 border-none overflow-hidden relative rounded-[32px] bg-white/5">
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[60px] -mr-16 -mt-16" />
      
      <div className="relative z-10 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/20 rounded-2xl">
            <Gift className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-black text-lg">Invite friends to EVPlugFinder</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-400/70">Share & Earn Rewards</p>
          </div>
        </div>

        <div className="bg-black/20 rounded-2xl p-4 flex items-center justify-between border border-white/5">
          <div className="font-mono text-xl font-black tracking-widest text-white/90">
            {referralCode}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full bg-white/5 hover:bg-white/10"
            onClick={handleCopyCode}
          >
            {shareResult === 'copied' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
          </Button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="font-bold text-muted-foreground">
            {referralCount > 0 
              ? `${referralCount} friend${referralCount === 1 ? '' : 's'} joined using your code`
              : 'Share your code to invite friends'}
          </span>
        </div>

        <div className="space-y-3 pt-2 border-t border-white/5">
          <Button 
            className="w-full h-12 rounded-2xl font-black shadow-lg shadow-blue-500/20 bg-blue-600 hover:bg-blue-700" 
            onClick={handleShare}
          >
            {shareResult === 'shared' ? (
              <span className="flex items-center gap-2"><Check className="w-4 h-4" /> Link shared!</span>
            ) : shareResult === 'copied' ? (
              <span className="flex items-center gap-2"><Check className="w-4 h-4" /> Copied to clipboard!</span>
            ) : (
              <span className="flex items-center gap-2"><Share2 className="w-4 h-4" /> Share invite link</span>
            )}
          </Button>

          <div className="text-center">
            <button 
              className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-white transition-colors"
              onClick={() => setShowHowItWorks(!showHowItWorks)}
            >
              How it works
            </button>
          </div>

          <AnimatePresence>
            {showHowItWorks && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-3 pb-1 space-y-2 text-xs font-medium text-muted-foreground pl-2 border-l-2 border-blue-500/30">
                  <p>1. Share your code with friends</p>
                  <p>2. They sign up using your link</p>
                  <p>3. Your referral count increases</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Card>
  );
}
