import React from 'react';
import { Zap, Clock, CreditCard, Leaf } from 'lucide-react';
import { formatDurationMinutes, formatCo2, type SessionShareData } from '@/lib/session-share-engine';

interface SessionShareCardProps {
  data: SessionShareData;
}

export function SessionShareCard({ data }: SessionShareCardProps) {
  return (
    <div className="w-[280px] aspect-[4/7] bg-slate-900 rounded-[32px] overflow-hidden flex flex-col relative shadow-2xl border border-white/5 mx-auto">
      {/* Background Decorative Grid */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      {/* Content */}
      <div className="flex-1 p-6 flex flex-col items-center text-center">
        <div className="mt-4">
          <p className="text-[#22c55e] text-[10px] font-black tracking-[0.2em] uppercase">EVPlugFinder</p>
          <p className="text-white/40 text-[8px] font-bold tracking-widest uppercase mt-1">Charging Session</p>
        </div>

        <h3 className="text-white text-xl font-black mt-8 leading-tight px-2 break-words">
          {data.stationName}
        </h3>

        <p className="text-white/30 text-[10px] font-bold mt-3">
          {data.sessionDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {data.sessionDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </p>

        <div className="w-12 h-[1px] bg-white/10 my-8" />

        <div className="grid grid-cols-2 gap-y-10 w-full px-2">
          <div className="flex flex-col items-center">
            <p className="text-blue-500 text-2xl font-black">{data.energyDelivered.toFixed(1)}</p>
            <p className="text-white/30 text-[8px] font-black uppercase tracking-tighter mt-1">kWh Delivered</p>
          </div>
          
          <div className="flex flex-col items-center">
            <p className="text-purple-500 text-2xl font-black">{formatDurationMinutes(data.durationMinutes)}</p>
            <p className="text-white/30 text-[8px] font-black uppercase tracking-tighter mt-1">Time Spent</p>
          </div>

          <div className="flex flex-col items-center">
            <p className="text-[#22c55e] text-2xl font-black">₹{Math.round(data.totalCost)}</p>
            <p className="text-white/30 text-[8px] font-black uppercase tracking-tighter mt-1">Total Cost</p>
          </div>

          <div className="flex flex-col items-center">
            <div className="relative">
              <p className="text-emerald-500 text-2xl font-black">{formatCo2(data.energyDelivered)}</p>
              <Leaf className="w-3 h-3 text-emerald-500/40 absolute -top-4 -right-4" />
            </div>
            <p className="text-white/30 text-[8px] font-black uppercase tracking-tighter mt-1">CO₂ Offset</p>
          </div>
        </div>
      </div>

      {/* Footer Strip */}
      <div className="h-12 bg-gradient-to-r from-[#22c55e] to-[#10b981] flex items-center justify-center">
        <p className="text-white text-[10px] font-black tracking-tight">Charged green · Powered by EVPlugFinder</p>
      </div>
    </div>
  );
}
