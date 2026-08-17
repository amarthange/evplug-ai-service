import { useMemo, useState, useRef } from "react";
import { useLocation } from "wouter";
import { 
  runCohortAnalysis, 
  CohortAnalysisResult, 
  CohortType, 
  RawBooking 
} from "@/lib/cohort-engine";
import { CohortMetricCards } from "./CohortMetricCards";
import { CohortBarChart } from "./CohortBarChart";
import { CohortDetailPanel } from "./CohortDetailPanel";
import { RetentionInsightCallout } from "./RetentionInsightCallout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DriverCohortSectionProps {
  bookings: any[];
  isLoading?: boolean;
}

export const DriverCohortSection = ({ bookings, isLoading = false }: DriverCohortSectionProps) => {
  const [selectedCohort, setSelectedCohort] = useState<CohortType>('loyal');
  const [, setLocation] = useLocation();
  const deepDiveRef = useRef<HTMLDivElement>(null);

  // We process the raw bookings into the shape expected by the engine
  const processedBookings = useMemo(() => {
    return bookings.map(b => ({
      id: b.id,
      userId: b.userId,
      stationId: b.stationId,
      status: b.status,
      currentCost: Number(b.totalPrice) || 0,
      startTime: b.startTime?.toDate?.() || new Date(b.startTime)
    })) as RawBooking[];
  }, [bookings]);

  const analysis = useMemo(() => {
    if (processedBookings.length === 0) return null;
    return runCohortAnalysis(processedBookings);
  }, [processedBookings]);

  const onViewChurn = () => {
    setSelectedCohort('lost');
    setTimeout(() => {
      deepDiveRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  if (isLoading) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center space-y-4 bg-slate-50/50 dark:bg-slate-900/20 rounded-[32px] border-2 border-dashed border-slate-200 dark:border-slate-800">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="font-black text-slate-500 uppercase tracking-widest text-xs">Analyzing Retention Cohorts...</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="p-12 text-center bg-slate-50/50 dark:bg-slate-900/20 rounded-[32px] border-2 border-dashed border-slate-200 dark:border-slate-800">
        <Info className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-black text-slate-900 dark:text-white">Insufficient Data</h3>
        <p className="text-sm text-slate-500 font-medium max-w-xs mx-auto mt-2">
          We need completed bookings to build driver retention cohorts. Once drivers start visiting your stations, analysis will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Retention Analysis</h2>
          <p className="text-sm font-medium text-slate-500">Automated behavioral segmentation of your driver base.</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full">
          <RefreshCw className="w-3 h-3" />
          Real-time Engine
        </div>
      </div>

      <CohortMetricCards cohorts={analysis.cohorts} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 rounded-[32px] border-none shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-black tracking-tight">Driver Distribution</CardTitle>
            <CardDescription className="text-xs font-medium">Headcount across different loyalty segments.</CardDescription>
          </CardHeader>
          <CardContent>
            <CohortBarChart cohorts={analysis.cohorts} />
          </CardContent>
        </Card>

        <Card ref={deepDiveRef} className="rounded-[32px] border-none shadow-sm bg-white dark:bg-slate-900 overflow-hidden transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-black tracking-tight">Segment Deep Dive</CardTitle>
            <CardDescription className="text-xs font-medium">Explore top performing drivers in each cohort.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedCohort} onValueChange={(v) => setSelectedCohort(v as CohortType)}>
              <TabsList className="grid grid-cols-4 w-full h-9 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
                <TabsTrigger value="loyal" className="text-[10px] font-black uppercase rounded-lg">Loyal</TabsTrigger>
                <TabsTrigger value="new" className="text-[10px] font-black uppercase rounded-lg">New</TabsTrigger>
                <TabsTrigger value="at_risk" className="text-[10px] font-black uppercase rounded-lg">Risk</TabsTrigger>
                <TabsTrigger value="lost" className="text-[10px] font-black uppercase rounded-lg">Lost</TabsTrigger>
              </TabsList>
              
              <TabsContent value={selectedCohort} className="mt-0">
                <CohortDetailPanel metrics={analysis.cohorts[selectedCohort]} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <RetentionInsightCallout 
        lostToLoyalRatio={analysis.lostToLoyalRatio}
        retentionRate={analysis.retentionRate}
        hasProblem={analysis.hasRetentionProblem}
        onLaunchCampaign={() => setLocation("/owner/promotions")}
        onViewChurn={onViewChurn}
      />
    </div>
  );
};
