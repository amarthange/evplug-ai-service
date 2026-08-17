import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, Share2, Users, Trophy, Gift, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

export default function ReferralPage() {
  const { user, userData } = useAuth();
  const { toast } = useToast();

  const { data: leaderboard, isLoading: loadingLeaderboard } = useQuery({
    queryKey: ["/api/referrals/leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/referrals/leaderboard");
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
  });

  const referralLink = `${window.location.origin}/auth?ref=${userData?.referralCode}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(userData?.referralCode || "");
    toast({
      title: "Copied!",
      description: "Referral code copied to clipboard",
    });
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "SeniorDevOps EV Charging",
          text: `Join SeniorDevOps EV Charging using my code ${userData?.referralCode} and get 100 bonus points!`,
          url: referralLink,
        });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      copyToClipboard();
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20 pt-8 px-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header Section */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Refer & Earn
          </h1>
          <p className="text-muted-foreground">
            Invite your friends and earn loyalty points for every successful signup.
          </p>
        </div>

        {/* Referral Code Card */}
        <Card className="border-primary/20 bg-primary/5 overflow-hidden">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="p-4 bg-background rounded-xl border border-primary/20 inline-block">
              <span className="text-2xl font-mono font-bold tracking-widest text-primary">
                {userData?.referralCode || "LOADING..."}
              </span>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={copyToClipboard}>
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
              <Button className="flex-1" onClick={handleShare}>
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-primary opacity-60" />
              <div className="text-2xl font-bold">{userData?.referralCount || 0}</div>
              <div className="text-xs text-muted-foreground">Total Referrals</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Gift className="w-8 h-8 mx-auto mb-2 text-primary opacity-60" />
              <div className="text-2xl font-bold">{userData?.loyaltyPoints || 0}</div>
              <div className="text-xs text-muted-foreground">Points Earned</div>
            </CardContent>
          </Card>
        </div>

        {/* How it Works */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Gift className="w-5 h-5 mr-2 text-primary" />
              Rewards
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary font-bold">1</span>
              </div>
              <div>
                <p className="font-medium text-sm">Your friend signs up</p>
                <p className="text-xs text-muted-foreground">Using your unique referral link or code.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary font-bold">2</span>
              </div>
              <div>
                <p className="font-medium text-sm">Friend gets 100 points</p>
                <p className="text-xs text-muted-foreground">Automatically credited to their account.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary font-bold">3</span>
              </div>
              <div>
                <p className="font-medium text-sm">You get 200 points</p>
                <p className="text-xs text-muted-foreground">Instantly rewarded for a successful referral.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Trophy className="w-5 h-5 mr-2 text-yellow-500" />
              Top Referrers
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingLeaderboard ? (
              <div className="p-8 text-center animate-pulse text-muted-foreground text-sm">
                Loading rankings...
              </div>
            ) : (
              <div className="divide-y">
                {leaderboard?.map((entry: any, index: number) => (
                  <div key={entry.uid} className="flex items-center gap-4 p-4">
                    <div className="w-6 text-sm font-bold text-muted-foreground">
                      {index + 1}
                    </div>
                    <Avatar className="w-10 h-10 border border-border">
                      <AvatarImage src={entry.photoURL} />
                      <AvatarFallback>{entry.displayName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm font-medium leading-none">
                        {entry.displayName}
                        {entry.uid === user?.uid && (
                          <span className="ml-2 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full uppercase font-bold">
                            You
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {entry.referralCount} referrals
                      </p>
                    </div>
                    {index === 0 && <Trophy className="w-5 h-5 text-yellow-500" />}
                  </div>
                ))}
                {(!leaderboard || leaderboard.length === 0) && (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No referrers yet. Be the first!
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
