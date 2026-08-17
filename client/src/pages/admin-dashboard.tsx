import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, AlertCircle, MoreVertical, TrendingUp } from "lucide-react";
import { Link } from "wouter";

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Station Owner Dashboard</h1>
        <p className="text-muted-foreground mb-8">Manage your charging stations and pricing</p>

        <div className="space-y-6">
          <Card className="p-6 border-l-4 border-green-500">
            <h2 className="text-xl font-bold mb-4">Feature: Owner Management Portal</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Owner Capabilities</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✅ Add & manage charging stations</li>
                  <li>✅ Update connector details & availability</li>
                  <li>✅ Set pricing per connector</li>
                  <li>✅ View real-time bookings</li>
                  <li>✅ Generate revenue reports</li>
                  <li>✅ Manage staff accounts</li>
                </ul>
              </div>

              <div className="pt-4 border-t">
                <Button className="w-full gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Launch Owner Dashboard
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid md:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">My Stations</p>
                <p className="text-3xl font-bold">0</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">Active Bookings</p>
                <p className="text-3xl font-bold">0</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">Revenue (This Month)</p>
                <p className="text-3xl font-bold">₹0</p>
              </div>
            </Card>
          </div>

          <Card className="p-6 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold mb-1">Status: In Development</h3>
                <p className="text-sm text-muted-foreground">
                  Requires: Owner authentication, role-based access, payment processing
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-4">Dashboard Sections</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted rounded">
                <div>
                  <p className="font-medium text-sm">Station Management</p>
                  <p className="text-xs text-muted-foreground">Add, edit, delete stations</p>
                </div>
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded">
                <div>
                  <p className="font-medium text-sm">Pricing & Rates</p>
                  <p className="text-xs text-muted-foreground">Set prices per kWh per connector</p>
                </div>
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted rounded">
                <div>
                  <p className="font-medium text-sm">Bookings & Revenue</p>
                  <p className="text-xs text-muted-foreground">Track all bookings & earnings</p>
                </div>
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </div>
              <Link href="/admin/analytics">
                <div className="flex items-center justify-between p-3 bg-muted rounded cursor-pointer hover:bg-muted/80 transition-colors">
                  <div>
                    <p className="font-medium text-sm">Advanced Platform Analytics</p>
                    <p className="text-xs text-muted-foreground">Real-time usage patterns & revenue insights</p>
                  </div>
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </div>
              </Link>
              <Link href="/admin/reports">
                <div className="flex items-center justify-between p-3 bg-muted rounded cursor-pointer hover:bg-muted/80 transition-colors">
                  <div>
                    <p className="font-medium text-sm">Monthly Reports</p>
                    <p className="text-xs text-muted-foreground">Generate tax-compliant financial summaries</p>
                  </div>
                  <BarChart3 className="w-4 h-4 text-primary" />
                </div>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
