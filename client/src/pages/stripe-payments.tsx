import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, AlertCircle } from "lucide-react";

export default function StripePayments() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Stripe Payment Integration</h1>
        <p className="text-muted-foreground mb-8">Real payment processing for booking confirmations</p>

        <div className="space-y-6">
          <Card className="p-6 border-l-4 border-blue-500">
            <h2 className="text-xl font-bold mb-4">Feature: Real Payment Processing</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">What It Does</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✅ Process credit/debit card payments</li>
                  <li>✅ Secure payment gateway (PCI compliant)</li>
                  <li>✅ Instant payment confirmation</li>
                  <li>✅ Refund handling</li>
                  <li>✅ Payment history tracking</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Setup Required</h3>
                <ol className="space-y-1 text-sm text-muted-foreground list-decimal list-inside">
                  <li>Create Stripe account at stripe.com</li>
                  <li>Get Publishable Key & Secret Key</li>
                  <li>Add STRIPE_PUBLISHABLE_KEY to secrets</li>
                  <li>Add STRIPE_SECRET_KEY to backend</li>
                  <li>Integrate checkout form on booking page</li>
                </ol>
              </div>

              <div className="pt-4 border-t">
                <Button className="w-full gap-2">
                  <CreditCard className="w-4 h-4" />
                  Setup Stripe Integration
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold mb-1">Status: Not Yet Implemented</h3>
                <p className="text-sm text-muted-foreground">
                  This feature requires Stripe API keys in secrets and backend payment processing logic.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-3">How Payments Will Work</h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="font-bold text-primary">1.</span>
                <span>User selects connector and booking details</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-primary">2.</span>
                <span>Stripe payment modal appears with card form</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-primary">3.</span>
                <span>Payment processed securely via Stripe</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-primary">4.</span>
                <span>Booking confirmed in Firestore</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-primary">5.</span>
                <span>User receives confirmation & receipt</span>
              </li>
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
