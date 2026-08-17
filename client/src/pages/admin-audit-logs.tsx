import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  startAfter,
  Timestamp,
  getCountFromServer,
  where
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Clipboard, 
  Download, 
  Search, 
  Filter, 
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Lock,
  Unlock,
  UploadCloud
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 25;

export default function AdminAuditLogs() {
  const [location, setLocation] = useLocation();
  const { user, userRole, loading: authLoading } = useAuth();
  
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [realStats, setRealStats] = useState({ total: 0, critical: 0, today: 0 });
  const { toast } = useToast();

  const [stations, setStations] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    const fetchEntities = async () => {
      try {
        const [stationsSnap, ownersSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, "stations")),
          getDocs(collection(db, "owners")),
          getDocs(collection(db, "users"))
        ]);
        setStations(stationsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setOwners(ownersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Failed to load map entities:", err);
      }
    };
    fetchEntities();
  }, []);

  const getEntityDisplayName = (log: any) => {
    if (log.targetName) return log.targetName;
    if (log.metadata?.targetName) return log.metadata.targetName;
    if (log.metadata?.stationName) return log.metadata.stationName;
    if (log.metadata?.userName) return log.metadata.userName;

    const id = log.targetId;
    if (!id) return "N/A";

    if (id.startsWith("benchmark_station")) return "Benchmark Station";
    if (id === user?.uid) {
      return user?.displayName || user?.email?.split('@')[0] || "Admin";
    }

    const station = stations.find(s => s.id === id);
    if (station) return station.name;

    const owner = owners.find(o => o.id === id || o.uid === id);
    if (owner) return owner.fullName || owner.name || owner.displayName || owner.email?.split('@')[0];

    const u = users.find(usr => usr.id === id || usr.uid === id);
    if (u) return u.fullName || u.displayName || u.email?.split('@')[0];

    return id.slice(0, 12) + "...";
  };

  // Filter State
  const [filterAction, setFilterAction] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  if (!authLoading && userRole !== "admin") {
    setLocation("/");
    return null;
  }

  const fetchLogs = async (loadMore = false) => {
    try {
      setLoading(true);
      
      const constraints: any[] = [];
      if (filterAction !== "all") constraints.push(where("action", "==", filterAction));
      if (filterSeverity !== "all") constraints.push(where("severity", "==", filterSeverity));
      
      let q = query(
        collection(db, "audit_logs"),
        ...constraints,
        orderBy("timestamp", "desc"),
        limit(PAGE_SIZE)
      );

      if (loadMore && lastDoc) {
        q = query(
          collection(db, "audit_logs"),
          ...constraints,
          orderBy("timestamp", "desc"),
          startAfter(lastDoc),
          limit(PAGE_SIZE)
        );
      }

      const snap = await getDocs(q);
      const newLogs = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      if (loadMore) {
        setLogs(prev => [...prev, ...newLogs]);
      } else {
        setLogs(newLogs);
      }

      setLastDoc(snap.docs[snap.docs.length - 1]);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      toast({ variant: "destructive", title: "Failed to load audit logs" });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const totalSnap = await getCountFromServer(collection(db, "audit_logs"));
      const critSnap = await getCountFromServer(query(collection(db, "audit_logs"), where("severity", "==", "CRITICAL")));
      
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todaySnap = await getCountFromServer(query(collection(db, "audit_logs"), where("timestamp", ">=", startOfToday)));

      setRealStats({
        total: totalSnap.data().count,
        critical: critSnap.data().count,
        today: todaySnap.data().count
      });
    } catch (e) {
      console.error("Failed to fetch aggregate stats", e);
    }
  };

  useEffect(() => {
    fetchLogs(false);
  }, [filterAction, filterSeverity]);

  useEffect(() => {
    fetchStats();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchSearch = !searchQuery || 
        log.action?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.targetId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.performedByEmail?.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchSearch;
    });
  }, [logs, searchQuery]);

  const stats = useMemo(() => {
    return {
      total: realStats.total,
      critical: realStats.critical,
      today: realStats.today,
      lastAction: logs[0]?.timestamp
    };
  }, [realStats, logs]);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "CRITICAL": return <Badge variant="destructive" className="font-bold border-2 animate-pulse">CRITICAL</Badge>;
      case "HIGH": return <Badge className="bg-orange-500 hover:bg-orange-600">HIGH</Badge>;
      case "MEDIUM": return <Badge className="bg-yellow-500 text-black hover:bg-yellow-600">MEDIUM</Badge>;
      default: return <Badge variant="secondary">LOW</Badge>;
    }
  };

  const getActionColor = (action: string) => {
    const a = action || "";
    if (a.includes("APPROVE")) return "text-green-500 font-medium";
    if (a.includes("REJECT") || a.includes("SUSPEND") || a.includes("BLOCK")) return "text-red-500 font-medium";
    if (a.includes("WIPE")) return "text-red-600 font-black";
    if (a.includes("PUBLISH") || a.includes("UNBLOCK")) return "text-blue-500 font-medium";
    return "text-foreground";
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "ID copied to clipboard" });
  };

  const exportLogsCSV = () => {
    const headers = [
      "Timestamp", "Action", "Severity",
      "Target ID", "Target Type",
      "Performed By", "Metadata"
    ];
    const rows = filteredLogs.map(l => [
      l.timestamp?.toDate ? l.timestamp.toDate().toISOString() : new Date(l.timestamp).toISOString(),
      l.action,
      l.severity,
      l.targetId,
      l.targetType,
      l.performedByEmail || l.performedBy,
      JSON.stringify(l.metadata || {})
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => 
        `"${String(v || "").replace(/"/g, '""')}"`)
        .join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  return (
    <div className="container mx-auto p-6 space-y-8 min-h-screen pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
            <Clipboard className="w-10 h-10 text-primary" />
            Audit Logs
          </h1>
          <p className="text-muted-foreground font-medium mt-1">
            Immutable record of all administrative actions
          </p>
        </div>
        <Button onClick={exportLogsCSV} variant="outline" className="gap-2 font-bold border-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground">Total Logs</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-black">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-red-500/5 border-red-500/20">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground">Critical Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-black text-red-500">{stats.critical}</div>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground">Today's Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-3xl font-black text-blue-500">{stats.today}</div>
          </CardContent>
        </Card>
        <Card className="bg-muted/50 border-border/50">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground">Last Action</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-sm font-bold">
            {stats.lastAction ? format(stats.lastAction.toDate ? stats.lastAction.toDate() : new Date(stats.lastAction), "MMM d, h:mm a") : "Never"}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-4 bg-card p-4 rounded-2xl border-2 border-border/50 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search action or target ID..." 
            className="pl-10 h-10 rounded-xl"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select 
          className="bg-background border-2 rounded-xl px-3 h-10 text-sm font-bold min-w-[150px]"
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
        >
          <option value="all">All Actions</option>
          <option value="USER_BLOCKED">User Blocked</option>
          <option value="USER_UNBLOCKED">User Unblocked</option>
          <option value="STATION_APPROVED">Station Approved</option>
          <option value="STATION_REJECTED">Station Rejected</option>
          <option value="PLATFORM_FEE_UPDATED">Fee Updated</option>
        </select>
        <select 
          className="bg-background border-2 rounded-xl px-3 h-10 text-sm font-bold min-w-[150px]"
          value={filterSeverity}
          onChange={e => setFilterSeverity(e.target.value)}
        >
          <option value="all">All Severities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
        <Button variant="ghost" className="rounded-xl font-bold" onClick={() => {
          setFilterAction("all");
          setFilterSeverity("all");
          setSearchQuery("");
        }}>Clear Filters</Button>
      </div>

      <Card className="border-2 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Timestamp</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Action</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Severity</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Target</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Performed By</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium whitespace-nowrap">
                    {format(log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp), "MMM d, yyyy · p")}
                  </TableCell>
                  <TableCell className={getActionColor(log.action)}>
                    {log.action?.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell>
                    {getSeverityBadge(log.severity)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 group cursor-pointer" title={`ID: ${log.targetId}`} onClick={() => copyToClipboard(log.targetId)}>
                      <span className="text-xs font-sans font-bold bg-muted px-1.5 py-0.5 rounded">
                        {getEntityDisplayName(log)}
                      </span>
                      <Clipboard className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate text-xs font-medium">
                    {log.performedByEmail || log.performedBy}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-8 text-xs font-bold" onClick={() => {
                        console.log("Log Details:", log.metadata);
                        toast({ title: "Details logged to console", description: "Metadata view is coming soon." });
                    }}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-bold italic">
                    No logs matching the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button 
            onClick={() => fetchLogs(true)} 
            variant="outline" 
            disabled={loading}
            className="rounded-full px-8 py-6 font-black uppercase tracking-widest border-2 hover:bg-primary hover:text-primary-foreground transition-all"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
            Load More ({PAGE_SIZE} per page)
          </Button>
        </div>
      )}
    </div>
  );
}
