import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Copy } from "lucide-react";
import { useState } from "react";

export default function Setup() {
  const [copied, setCopied] = useState<string | null>(null);

  const credentials = [
    {
      name: "VITE_FIREBASE_API_KEY",
      required: true,
      description: "Firebase project API key",
      example: "AIzaSyDxxx...",
      status: import.meta.env.VITE_FIREBASE_API_KEY ? "set" : "missing",
    },
    {
      name: "VITE_FIREBASE_PROJECT_ID",
      required: true,
      description: "Firebase project ID",
      example: "my-project-123456",
      status: import.meta.env.VITE_FIREBASE_PROJECT_ID ? "set" : "missing",
    },
    {
      name: "VITE_FIREBASE_APP_ID",
      required: true,
      description: "Firebase app ID",
      example: "1:123456789:web:abcdef123456",
      status: import.meta.env.VITE_FIREBASE_APP_ID ? "set" : "missing",
    },
    {
      name: "VITE_GOOGLE_MAPS_API_KEY",
      required: true,
      description: "Google Maps API Key (required for maps, routing, geocoding and place search)",
      example: "AIzaSyDxxx...",
      status: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? "set" : "missing",
    },
    {
      name: "SESSION_SECRET",
      required: true,
      description: "Backend session secret key",
      example: "my-secret-key-12345",
      status: "set", // Backend only, we can't check from frontend
    },
  ];

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const firebaseRequired = credentials
    .filter((c) => c.required && c.status === "missing")
    .map((c) => c.name);

  const isReady = firebaseRequired.length === 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Setup Configuration</h1>
          <p className="text-muted-foreground">
            Add your credentials to Replit Secrets to get started
          </p>
        </div>

        {/* Status */}
        <Card className="p-6 mb-8 border-l-4" style={{ borderLeftColor: isReady ? "#22c55e" : "#ef4444" }}>
          <div className="flex items-start gap-3">
            {isReady ? (
              <>
                <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-semibold text-lg text-green-600">All Set! 🎉</h2>
                  <p className="text-sm text-muted-foreground">
                    Your Firebase credentials are configured. The app is ready to use!
                  </p>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-semibold text-lg text-red-600">Configuration Needed</h2>
                  <p className="text-sm text-muted-foreground">
                    Please add the missing credentials below
                  </p>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Instructions */}
        <Card className="p-6 mb-8 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <span className="text-blue-600 dark:text-blue-400">📋</span>
            How to Add Credentials
          </h2>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">1.</span>
              <span>
                Click the <strong>Secrets</strong> button in the left panel (looks like a lock icon)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">2.</span>
              <span>
                Click <strong>+ Add New Secret</strong>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">3.</span>
              <span>
                Copy the secret name from below and paste it as the <strong>Key</strong>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">4.</span>
              <span>
                Paste your credential value as the <strong>Value</strong>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">5.</span>
              <span>
                Click <strong>Add Secret</strong> and the app will automatically restart
              </span>
            </li>
          </ol>
        </Card>

        {/* Credentials List */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Required & Optional Secrets</h2>

          {credentials.map((cred) => (
            <Card key={cred.name} className="p-6 border-l-4" style={{
              borderLeftColor: cred.status === "set" ? "#22c55e" : cred.required ? "#ef4444" : "#f59e0b",
            }}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-mono font-semibold">{cred.name}</h3>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      cred.required 
                        ? "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200" 
                        : "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200"
                    }`}>
                      {cred.required ? "REQUIRED" : "OPTIONAL"}
                    </span>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      cred.status === "set"
                        ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                    }`}>
                      {cred.status === "set" ? "✓ SET" : "NOT SET"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{cred.description}</p>
                  <div className="bg-muted rounded p-3 font-mono text-xs mb-3">
                    <div className="text-muted-foreground mb-1">Example:</div>
                    <div className="text-foreground break-all">{cred.example}</div>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(cred.name, `copy-${cred.name}`)}
                  data-testid={`button-copy-${cred.name}`}
                  className="flex-shrink-0"
                >
                  {copied === `copy-${cred.name}` ? "Copied!" : "Copy"}
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Get Credentials */}
        <Card className="p-6 mt-8 bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800">
          <h2 className="font-semibold mb-4">Get Your Credentials</h2>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium mb-2">🔥 Firebase (REQUIRED)</p>
              <ol className="ml-4 space-y-1 text-muted-foreground">
                <li>1. Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://console.firebase.google.com</a></li>
                <li>2. Create a new project (any name)</li>
                <li>3. Enable Authentication (Email/Password + Google)</li>
                <li>4. Enable Firestore Database</li>
                <li>5. Go to Project Settings → General</li>
                <li>6. Copy your API Key, Project ID, and App ID</li>
              </ol>
            </div>
            <div className="pt-3 border-t">
              <p className="font-medium mb-2">🗺️ Google Maps Platform (REQUIRED)</p>
              <ol className="ml-4 space-y-1 text-muted-foreground">
                <li>1. Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://console.cloud.google.com</a></li>
                <li>2. Enable the Maps JavaScript API, Places API, Geocoding API, Directions API, and Distance Matrix API</li>
                <li>3. Go to Credentials and generate an API key</li>
                <li>4. Paste it as the VITE_GOOGLE_MAPS_API_KEY secret value</li>
              </ol>
            </div>
          </div>
        </Card>

        {/* Firebase Domain Setup */}
        <Card className="p-6 mt-8 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <span>⚠️</span>
            Important: Add Replit URL to Firebase
          </h2>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              After adding credentials, you need to authorize your Replit URL in Firebase:
            </p>
            <ol className="ml-4 space-y-1">
              <li>1. Go to Firebase Console → Authentication → Settings</li>
              <li>2. Scroll to "Authorized domains"</li>
              <li>3. Click "Add domain"</li>
              <li>4. Copy your Replit dev URL from the browser address bar (something like: <span className="font-mono text-xs">d986cf7a-xxx.kirk.repl.co</span>)</li>
              <li>5. Paste and save</li>
            </ol>
          </div>
        </Card>
      </div>
    </div>
  );
}
