import { linearRegression, linearRegressionLine } from 'simple-statistics';
import { subDays, startOfDay, format, eachDayOfInterval } from 'date-fns';

export interface DailyData {
  date: string;
  count: number;
}

export interface ForecastResult {
  actual: DailyData[];
  predicted: (DailyData & { lower: number; upper: number })[];
  trend: "increasing" | "decreasing";
  growthRate: number;
}

/**
 * Generates demand forecast based on historical bookings
 */
export function generateDemandForecast(bookings: any[]): ForecastResult {
  // 1. Group bookings by day for the last 90 days
  const last90Days = eachDayOfInterval({
    start: startOfDay(subDays(new Date(), 90)),
    end: startOfDay(new Date())
  });

  const dailyCounts = last90Days.map(day => {
    const dateStr = format(day, "yyyy-MM-dd");
    const count = bookings.filter(b => {
      const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return format(startOfDay(bDate), "yyyy-MM-dd") === dateStr;
    }).length;
    return { date: dateStr, count };
  });

  // 2. Linear Regression for next 30 days
  const regressionData = dailyCounts.map((d, i) => [i, d.count]);
  const regression = linearRegression(regressionData);
  const predict = linearRegressionLine(regression);

  const predicted = Array.from({ length: 30 }, (_, i) => {
    const dayIndex = dailyCounts.length + i;
    const prediction = Math.max(0, predict(dayIndex));
    const day = startOfDay(subDays(new Date(), -1 - i));
    
    return {
      date: format(day, "yyyy-MM-dd"),
      count: Math.round(prediction),
      lower: Math.round(prediction * 0.8),
      upper: Math.round(prediction * 1.2)
    };
  });

  // 3. Trend analysis (SMA)
  const sma7 = dailyCounts.slice(-7).reduce((a, b) => a + b.count, 0) / 7;
  const sma30 = dailyCounts.slice(-30).reduce((a, b) => a + b.count, 0) / 30;
  
  const growthRate = sma30 > 0 ? ((sma7 - sma30) / sma30) * 100 : 0;

  return {
    actual: dailyCounts,
    predicted,
    trend: sma7 > sma30 ? "increasing" : "decreasing",
    growthRate
  };
}

/**
 * Peak Hour Prediction (Heatmap Data)
 */
export function calculatePeakHours(bookings: any[]) {
  const heatmap: Record<string, number[]> = {
    "Mon": Array(24).fill(0),
    "Tue": Array(24).fill(0),
    "Wed": Array(24).fill(0),
    "Thu": Array(24).fill(0),
    "Fri": Array(24).fill(0),
    "Sat": Array(24).fill(0),
    "Sun": Array(24).fill(0),
  };

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  bookings.forEach(b => {
    const date = b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime);
    if (!isNaN(date.getTime())) {
      const day = days[date.getDay()];
      const hour = date.getHours();
      heatmap[day][hour]++;
    }
  });

  return heatmap;
}

/**
 * Revenue Forecast
 */
export function forecastRevenue(actualRevenue: number, growthRate: number) {
  const expected = actualRevenue * (1 + growthRate / 100);
  return {
    conservative: expected * 0.9,
    expected,
    optimistic: expected * 1.1
  };
}
