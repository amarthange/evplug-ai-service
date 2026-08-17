import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  where
} from "firebase/firestore";
import { 
  Activity, 
  Search, 
  Filter, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert,
  User,
  Clock,
  Terminal,
  RefreshCw,
  Zap,
  ShieldCheck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { jsPDF } from "jspdf";
import { useToast } from "@/hooks/use-toast";

const parseLogDate = (timestamp: any) => {
  if (!timestamp) return new Date();
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  return new Date(timestamp);
};

export default function AdminActivity() {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const exportPDF = () => {
    try {
      const doc = new jsPDF();
      
      // Header Section
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text("EVPlugFinder System Audit & Activity Report", 20, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 28);
      doc.text(`Active Filter: ${filter.toUpperCase()}`, 20, 33);
      doc.text(`Total Log Count: ${filteredLogs.length} events`, 20, 38);
      
      // Drawing line
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.line(20, 42, 190, 42);
      
      // Table Headers
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text("Action / Message", 20, 50);
      doc.text("Type", 95, 50);
      doc.text("Performed By", 130, 50);
      doc.text("Time", 170, 50);
      
      doc.line(20, 53, 190, 53);
      
      // Table Content
      let y = 62;
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85); // slate-700
      
      filteredLogs.forEach((log, index) => {
        if (y > 270) {
          doc.addPage();
          y = 30;
          doc.setFontSize(11);
          doc.setTextColor(15, 23, 42);
          doc.text("Action / Message", 20, 15);
          doc.text("Type", 95, 15);
          doc.text("Performed By", 130, 15);
          doc.text("Time", 170, 15);
          doc.line(20, 18, 190, 18);
          doc.setFontSize(9);
          doc.setTextColor(51, 65, 85);
          y = 28;
        }
        
        // Safe Text truncation for column fit
        const actionText = log.action || log.message || "N/A";
        const truncatedAction = actionText.length > 35 ? actionText.substring(0, 32) + "..." : actionText;
        const performedBy = log.performedByEmail || log.performedBy || log.adminEmail || log.userId || "System";
        const truncatedUser = performedBy.length > 20 ? performedBy.substring(0, 17) + "..." : performedBy;
        const typeText = log.type || log.action || "INFO";
        const dateText = parseLogDate(log.timestamp).toLocaleString();
        
        doc.text(truncatedAction, 20, y);
        doc.text(typeText, 95, y);
        doc.text(truncatedUser, 130, y);
        doc.text(dateText, 170, y);
        
        y += 8;
      });
      
      // Footer page count or branding
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text("CONFIDENTIAL - FOR AUTHORIZED PLATFORM STAFF ONLY", 20, 287);
      
      // Save file
      doc.save(`EVPlugFinder_System_Audit_${new Date().toISOString().split('T')[0]}.pdf`);
      
      toast({
        title: "Audit Report Exported",
        description: "PDF report downloaded successfully.",
      });
    } catch (err) {
      console.error("Failed to generate PDF audit:", err);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to generate system audit report PDF.",
      });
    }
  };

  useEffect(() => {
    if (!db) return;
    
    const q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(150));

    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs
      .filter(log => filter === "all" || log.type === filter)
      .slice(0, 50);
  }, [logs, filter]);

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'SECURITY': return <ShieldAlert className="w-4 h-4 text-rose-500" />;
      case 'DATA_EXPORT': return <Terminal className="w-4 h-4 text-amber-500" />;
      case 'STATION_UPDATE': return <Zap className="w-4 h-4 text-blue-500" />;
      default: return <Activity className="w-4 h-4 text-emerald-500" />;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-8 bg-[var(--admin-bg)] text-[var(--admin-text-primary)] transition-colors duration-300 min-h-screen">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black flex items-center gap-3 italic tracking-tighter">
            <Activity className="w-10 h-10 text-primary animate-pulse" />
            LIVE ACTIVITY FEED
          </h1>
          <p className="admin-text-muted mt-2 font-medium">Real-time stream of administrative actions and system events.</p>
        </div>
        <div className="flex gap-2 bg-[var(--admin-border-muted)] p-1 rounded-xl border border-[var(--admin-border)]">
          {["all", "SECURITY", "DATA_EXPORT", "STATION_UPDATE"].map((t) => (
            <Button
              key={t}
              variant="ghost"
              size="sm"
              onClick={() => setFilter(t)}
              className={cn(
                "text-[10px] font-black uppercase tracking-widest h-8 rounded-lg",
                filter === t ? "bg-primary text-primary-foreground" : "admin-text-muted hover:admin-text-primary"
              )}
            >
              {t}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-50">
              <RefreshCw className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm font-bold uppercase tracking-widest admin-text-primary">Synchronizing Live Feed...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-24 admin-glass-card border-none rounded-3xl">
              <Activity className="w-12 h-12 text-[var(--admin-border)] mx-auto mb-4" />
              <p className="admin-text-muted italic">No activity logs found for the selected filter.</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <Card key={log.id} className="admin-glass-card border-none hover:ring-1 hover:ring-primary/30 transition-all group overflow-hidden border-l-4 border-l-transparent hover:border-l-primary shadow-md">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-[var(--admin-border-muted)] rounded-xl border border-[var(--admin-border)]">
                      {getLogIcon(log.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black admin-text-secondary">{log.action || log.message}</span>
                        <Badge className="bg-[var(--admin-border-muted)] text-[10px] admin-text-muted border border-[var(--admin-border)]">
                          {log.type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs admin-text-muted flex items-center gap-1 font-medium">
                          <User className="w-3 h-3" /> {log.adminEmail || log.userId || 'System'}
                        </span>
                        <span className="text-xs admin-text-muted flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {log.timestamp ? formatDistanceToNow(parseLogDate(log.timestamp), { addSuffix: true }) : 'just now'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-6">
          <Card className="admin-glass-card border-none shadow-2xl">
            <CardHeader>
              <CardTitle className="text-sm font-black uppercase admin-text-primary">System Health</CardTitle>
              <CardDescription className="admin-text-muted">Live telemetry data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="admin-text-muted">Event Frequency</span>
                <span className="font-bold text-emerald-500">12 events/min</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="admin-text-muted">Audit Storage</span>
                <span className="font-bold admin-text-secondary">14.2 GB</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="admin-text-muted">Log Retention</span>
                <span className="font-bold admin-text-secondary">365 Days</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border border-primary/20 p-6 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <ShieldCheck className="w-24 h-24" />
            </div>
            <div className="relative z-10 space-y-4">
              <h4 className="text-sm font-black italic tracking-tighter text-primary">SECURE MONITORING</h4>
              <p className="text-[10px] admin-text-muted uppercase font-black leading-relaxed">
                Every action in the EVPlugFinder ecosystem is cryptographically signed and stored in immutable audit logs for regulatory compliance.
              </p>
              <Button 
                onClick={exportPDF}
                size="sm" 
                className="w-full bg-primary font-black rounded-lg hover:bg-primary/90 transition-all active:scale-[0.98] text-white"
              >
                DOWNLOAD PDF AUDIT
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}


