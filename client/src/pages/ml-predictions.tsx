import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, AlertCircle } from "lucide-react";

export default function MLPredictions() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">ML Predictions</h1>
        <p className="text-muted-foreground mb-8">AI-powered availability forecasting using historical data</p>

        <div className="space-y-6">
          <Card className="p-6 border-l-4 border-purple-500">
            <h2 className="text-xl font-bold mb-4">Feature: Smart Availability Predictions</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">What It Does</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✅ Predicts connector availability 1-24 hours ahead</li>
                  <li>✅ Learns from historical occupancy patterns</li>
                  <li>✅ Uses LightGBM machine learning model</li>
                  <li>✅ Shows confidence scores for predictions</li>
                  <li>✅ Suggests best booking times</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold mb-2">How It Works</h3>
                <ol className="space-y-1 text-sm text-muted-foreground list-decimal list-inside">
                  <li>Collect telemetry data (occupancy over time)</li>
                  <li>Train LightGBM model on patterns</li>
                  <li>Feed features: time of day, day of week, weather</li>
                  <li>Model predicts availability probability</li>
                  <li>Show predictions on station detail page</li>
                </ol>
              </div>

              <div className="pt-4 border-t">
                <Button className="w-full gap-2">
                  <Zap className="w-4 h-4" />
                  Setup ML Service
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold mb-1">Status: Ready to Deploy</h3>
                <p className="text-sm text-muted-foreground">
                  Python FastAPI service is included. Run with: <code className="bg-black/20 px-2 py-1 rounded">cd ml_service && uvicorn main:app</code>
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-3">Prediction Features</h3>
            <div className="grid gap-4">
              <div className="p-3 bg-muted rounded">
                <p className="font-medium text-sm">📊 Time-Based Patterns</p>
                <p className="text-xs text-muted-foreground">Peak hours: 8-10 AM, 4-6 PM</p>
              </div>
              <div className="p-3 bg-muted rounded">
                <p className="font-medium text-sm">📅 Weekly Trends</p>
                <p className="text-xs text-muted-foreground">Weekends less busy, weekdays peak usage</p>
              </div>
              <div className="p-3 bg-muted rounded">
                <p className="font-medium text-sm">🌤️ Weather Integration</p>
                <p className="text-xs text-muted-foreground">Rainy days = more charging demand</p>
              </div>
              <div className="p-3 bg-muted rounded">
                <p className="font-medium text-sm">🎯 Smart Recommendations</p>
                <p className="text-xs text-muted-foreground">Suggests best times to book</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
