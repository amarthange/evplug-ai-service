import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  writeBatch, 
  doc, 
  addDoc, 
  serverTimestamp,
  getDocs,
  where
} from "firebase/firestore";
import { 
  Database, 
  Download, 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  History, 
  FileSpreadsheet,
  Trash2,
  Play,
  Loader2,
  Table as TableIcon,
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
  Save,
  Star,
  Zap,
  Users
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

export default function AdminDataManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importType, setImportType] = useState<"stations" | "points" | "connectors">("stations");
  const [importData, setImportData] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<any[]>([]);
  const [isDryRun, setIsDryRun] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!db || !user) return;
    const unsub = onSnapshot(
      query(collection(db, "import_history"), orderBy("importedAt", "desc"), limit(10)),
      (snap) => {
        setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    );
    return () => unsub();
  }, [user]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        validateData(results.data);
      },
      error: (error) => {
        toast({ title: "Parsing failed", description: error.message, variant: "destructive" });
      }
    });
  };

  const validateData = (data: any[]) => {
    const errors: any[] = [];
    const valid: any[] = [];

    data.forEach((row, i) => {
      const rowErrors: string[] = [];
      if (importType === "stations") {
        if (!row.name) rowErrors.push("Missing name");
        if (!row.lat || isNaN(parseFloat(row.lat))) rowErrors.push("Invalid lat");
        if (!row.lon || isNaN(parseFloat(row.lon))) rowErrors.push("Invalid lon");
        if (row.ratePerKwh <= 0) rowErrors.push("Rate must be > 0");
      }
      
      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, message: rowErrors.join(", ") });
      } else {
        valid.push(row);
      }
    });

    setImportData(valid);
    setImportErrors(errors);
    toast({ title: `Validated ${data.length} records`, description: `${valid.length} valid, ${errors.length} failed.` });
  };

  const processImport = async () => {
    if (importData.length === 0) return;
    setProcessing(true);
    setProgress(0);

    const startTime = Date.now();
    let successCount = 0;
    let failedCount = importErrors.length;

    try {
      if (!isDryRun) {
        const batchSize = 100;
        for (let i = 0; i < importData.length; i += batchSize) {
          const batch = writeBatch(db);
          const chunk = importData.slice(i, i + batchSize);
          
          chunk.forEach(row => {
            const ref = doc(collection(db, importType));
            batch.set(ref, {
              ...row,
              lat: parseFloat(row.lat),
              lon: parseFloat(row.lon),
              ratePerKwh: parseFloat(row.ratePerKwh),
              connectorTypes: row.connectorTypes?.split(",").map((s: string) => s.trim()),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            successCount++;
          });

          await batch.commit();
          setProgress(Math.round(((i + chunk.length) / importData.length) * 100));
        }

        await addDoc(collection(db, "audit_logs"), {
          action: "DATA_IMPORT_COMPLETED",
          category: "DATABASE",
          importType,
          recordCount: importData.length,
          successCount,
          failedCount,
          performedBy: user?.uid,
          performedByEmail: user?.email,
          severity: "HIGH",
          timestamp: serverTimestamp()
        });

        toast({ title: "Import Complete", description: `Successfully imported ${successCount} records.` });
        setImportData([]);
      } else {
        toast({ title: "Dry Run Successful", description: "All data validated. Switch off 'Dry Run' to commit." });
      }
    } catch (error: any) {
      toast({ title: "Import Failed", description: error.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const exportCSV = async (collectionName: string) => {
    try {
      const snap = await getDocs(collection(db, collectionName));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evplugfinder_${collectionName}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();

      await addDoc(collection(db, "audit_logs"), {
        action: "DATA_EXPORT_CSV",
        category: "DATABASE",
        collection: collectionName,
        performedBy: user?.uid,
        performedByEmail: user?.email,
        severity: "MEDIUM",
        timestamp: serverTimestamp()
      });
    } catch (error) {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const exportExcel = async () => {
    try {
      const bookingsSnap = await getDocs(query(collection(db, "bookings"), limit(1000)));
      const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(bookings);
      XLSX.utils.book_append_sheet(wb, ws, "Bookings");
      
      XLSX.writeFile(wb, `evplugfinder_revenue_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast({ title: "Excel exported successfully" });
    } catch (error) {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-8 bg-[var(--admin-bg)] text-[var(--admin-text-primary)] transition-colors duration-300 min-h-screen">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black flex items-center gap-3">
            <Database className="w-10 h-10 text-primary animate-pulse" />
            Data Management
          </h1>
          <p className="admin-text-muted mt-2 font-medium italic">Bulk import, export, and platform synchronization tools.</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => exportCSV("stations")} variant="outline" className="gap-2 border-[var(--admin-border)]">
            <TableIcon className="w-4 h-4" /> Export Stations CSV
          </Button>
          <Button onClick={exportExcel} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <FileSpreadsheet className="w-4 h-4" /> Export Revenue Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Import Section */}
        <Card className="lg:col-span-2 admin-glass-card border-none shadow-2xl overflow-hidden border-t-4 border-t-primary">
          <CardHeader className="bg-[var(--admin-border-muted)] border-b border-[var(--admin-border)]">
            <CardTitle className="flex items-center gap-2 admin-text-primary">
              <Upload className="w-5 h-5 text-primary" />
              Bulk Data Import
            </CardTitle>
            <CardDescription className="admin-text-muted">Upload CSV files to batch-create records.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div 
                className={cn(
                  "p-4 rounded-xl border-2 cursor-pointer transition-all",
                  importType === 'stations' ? "border-primary bg-primary/10" : "border-[var(--admin-border)] hover:bg-[var(--admin-border-muted)]"
                )}
                onClick={() => setImportType('stations')}
              >
                <div className="flex flex-col items-center gap-2">
                  <Database className="w-6 h-6 animate-none" />
                  <span className="text-xs font-black uppercase tracking-widest admin-text-secondary">Stations</span>
                </div>
              </div>
              <div 
                className={cn(
                  "p-4 rounded-xl border-2 cursor-pointer transition-all",
                  importType === 'points' ? "border-primary bg-primary/10" : "border-[var(--admin-border)] hover:bg-[var(--admin-border-muted)]"
                )}
                onClick={() => setImportType('points')}
              >
                <div className="flex flex-col items-center gap-2">
                  <Star className="w-6 h-6 animate-none" />
                  <span className="text-xs font-black uppercase tracking-widest admin-text-secondary">User Points</span>
                </div>
              </div>
              <div 
                className={cn(
                  "p-4 rounded-xl border-2 cursor-pointer transition-all",
                  importType === 'connectors' ? "border-primary bg-primary/10" : "border-[var(--admin-border)] hover:bg-[var(--admin-border-muted)]"
                )}
                onClick={() => setImportType('connectors')}
              >
                <div className="flex flex-col items-center gap-2">
                  <Zap className="w-6 h-6 animate-none" />
                  <span className="text-xs font-black uppercase tracking-widest admin-text-secondary">Connectors</span>
                </div>
              </div>
            </div>

            <div className="bg-[var(--admin-border-muted)] border border-[var(--admin-border)] p-8 rounded-2xl border-dashed text-center space-y-4">
              <Upload className="w-12 h-12 text-slate-700 mx-auto" />
              <div className="space-y-1">
                <p className="font-bold admin-text-primary">Select CSV file for {importType}</p>
                <p className="text-xs admin-text-muted italic">Template: name, address, lat, lon, ratePerKwh...</p>
              </div>
              <Input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept=".csv"
                onChange={handleFileUpload}
              />
              <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="font-bold border-[var(--admin-border)]">
                Choose File
              </Button>
            </div>

            {importData.length > 0 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                <div className="flex justify-between items-center bg-[var(--admin-border-muted)] p-4 rounded-xl">
                  <div className="flex items-center gap-4">
                    <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">
                      {importData.length} Valid
                    </Badge>
                    <Badge variant="destructive" className="bg-red-500/20 text-red-500 border-red-500/30">
                      {importErrors.length} Errors
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="dryrun" checked={isDryRun} onCheckedChange={(v) => setIsDryRun(!!v)} />
                      <label htmlFor="dryrun" className="text-sm font-medium leading-none admin-text-secondary">Dry Run</label>
                    </div>
                    <Button onClick={processImport} disabled={processing} className="gap-2 font-black text-white">
                      {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      {isDryRun ? "Validate All" : `Import ${importData.length} Records`}
                    </Button>
                  </div>
                </div>

                {processing && <Progress value={progress} className="h-1 bg-[var(--admin-border)]" />}

                {importErrors.length > 0 && (
                   <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 max-h-[200px] overflow-auto space-y-2">
                      <h4 className="text-xs font-black uppercase text-red-500 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" /> Validation Failures
                      </h4>
                      {importErrors.map((err, i) => (
                        <p key={i} className="text-xs text-red-400/80">Row {err.row}: {err.message}</p>
                      ))}
                   </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* History Section */}
        <Card className="admin-glass-card border-none shadow-2xl overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 admin-text-primary">
              <History className="w-5 h-5 text-primary" />
              Recent Imports
            </CardTitle>
            <CardDescription className="admin-text-muted">Log of past bulk operations.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--admin-border)] hover:bg-transparent">
                  <TableHead className="text-[10px] font-black uppercase admin-text-muted">Type</TableHead>
                  <TableHead className="text-[10px] font-black uppercase admin-text-muted">Success</TableHead>
                  <TableHead className="text-[10px] font-black uppercase admin-text-muted text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.id} className="border-[var(--admin-border)] hover:bg-[var(--admin-border-muted)]">
                    <TableCell className="capitalize font-bold text-xs admin-text-secondary">{item.importType}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-emerald-500 font-black text-xs">+{item.successCount}</span>
                        {item.failedCount > 0 && <span className="text-red-500 text-[10px]">-{item.failedCount} failed</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-[10px] admin-text-muted">
                      {item.importedAt?.toDate().toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Quick Tools */}
        <Card className="lg:col-span-3 admin-glass-card border-none shadow-2xl">
          <CardHeader className="bg-[var(--admin-border-muted)] border-b border-[var(--admin-border)]">
            <CardTitle className="admin-text-primary">Fast Export Tools</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase admin-text-muted">Users & Security</h4>
                <Button onClick={() => exportCSV("users")} variant="ghost" className="w-full justify-start gap-2 h-12 rounded-xl hover:bg-[var(--admin-border-muted)] text-[var(--admin-text-primary)]">
                  <Users className="w-5 h-5 text-blue-400" />
                  <div className="text-left">
                    <div className="text-sm font-bold">Export User PII</div>
                    <div className="text-[10px] admin-text-muted">Includes emails & loyalty data</div>
                  </div>
                </Button>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase admin-text-muted">Operational Data</h4>
                <Button onClick={() => exportCSV("bookings")} variant="ghost" className="w-full justify-start gap-2 h-12 rounded-xl hover:bg-[var(--admin-border-muted)] text-[var(--admin-text-primary)]">
                  <FileText className="w-5 h-5 text-amber-400" />
                  <div className="text-left">
                    <div className="text-sm font-bold">Raw Bookings CSV</div>
                    <div className="text-[10px] admin-text-muted">Last 90 days of session logs</div>
                  </div>
                </Button>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase admin-text-muted">Audit & Compliance</h4>
                <Button onClick={() => exportCSV("audit_logs")} variant="ghost" className="w-full justify-start gap-2 h-12 rounded-xl hover:bg-[var(--admin-border-muted)] text-[var(--admin-text-primary)]">
                  <ShieldAlert className="w-5 h-5 text-rose-400" />
                  <div className="text-left">
                    <div className="text-sm font-bold">Security Audit Log</div>
                    <div className="text-[10px] admin-text-muted">Full system event history</div>
                  </div>
                </Button>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-sm font-black italic tracking-tighter text-primary">FINANCIAL COMPLIANCE</h4>
                  <p className="text-[10px] admin-text-muted">Generate multi-sheet revenue report for tax auditing.</p>
                </div>
                <Button size="icon" onClick={exportExcel} className="rounded-full w-12 h-12 shadow-lg shadow-emerald-500/20 text-white">
                  <Download className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="text-center py-12">
        <p className="text-[10px] uppercase font-bold admin-text-muted tracking-[0.5em]">EVPlugFinder Data Sync Engine v2.1</p>
      </div>
    </div>
  );
}
