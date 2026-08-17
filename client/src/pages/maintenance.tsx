import { motion } from "framer-motion";
import { Zap, Clock, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function MaintenancePage({ 
  message, 
  endsAt 
}: { 
  message?: string;
  endsAt?: any; // Firestore Timestamp
}) {
  const formattedEndTime = endsAt?.toDate 
    ? endsAt.toDate().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : endsAt;
  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 text-white overflow-hidden relative">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] -mr-64 -mt-64 animate-pulse" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] -ml-64 -mb-64 animate-pulse" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-md w-full relative z-10"
      >
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl bg-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-500/40 relative z-10">
              <Zap className="w-12 h-12 text-white" />
            </div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 w-24 h-24 border-2 border-dashed border-indigo-400/30 rounded-3xl -m-2"
            />
          </div>
        </div>

        <Card className="glass-card border-none bg-white/[0.03] overflow-hidden">
          <CardContent className="p-8 text-center space-y-6">
            <div className="space-y-2">
              <Badge className="bg-amber-500/10 text-amber-500 border-none px-4 py-1 uppercase font-black text-[10px] tracking-widest mb-4">
                System Offline
              </Badge>
              <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white">
                Platform <span className="text-indigo-400">Upgrade</span>
              </h1>
              <p className="text-slate-400 text-sm font-medium leading-relaxed">
                {message || "EVPlugFinder is currently undergoing scheduled maintenance to upgrade our charging network infrastructure."}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center gap-4 text-left">
              <div className="p-3 bg-white/5 rounded-xl">
                <Clock className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Expected Recovery</p>
                <p className="text-sm font-bold text-white">{formattedEndTime || "TBD - Checking Telemetry..."}</p>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-center gap-2 text-[10px] uppercase font-black tracking-[0.2em] text-slate-600">
              <ShieldAlert className="w-4 h-4" />
              Critical Ops: Authorized Admins Only
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function Badge({ children, className }: any) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}
