// Firebase Admin SDK for server-side operations
import admin from "firebase-admin";

import fs from "fs";
import path from "path";

// Check if Firebase Admin is already initialized
if (!admin.apps.length) {
  // In development, Firebase Admin credentials should be provided via environment variable
  // For now, we'll use the client-side Firebase (Firestore operates from client)
  // This file is a placeholder for future server-side Firebase Admin operations
  
  // To use Firebase Admin, set FIREBASE_ADMIN_CREDENTIALS in Replit Secrets as JSON:
  // {
  //   "type": "service_account",
  //   "project_id": "your-project-id",
  //   "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  //   "client_email": "firebase-adminsdk-...@your-project.iam.gserviceaccount.com"
  // }
  
  let credentials = process.env.FIREBASE_ADMIN_CREDENTIALS;

  if (!credentials) {
    try {
      const envPath = path.join(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf8");
        const match = envContent.match(/FIREBASE_ADMIN_CREDENTIALS\s*=\s*({[\s\S]*?^})/m);
        if (match && match[1]) {
          credentials = match[1];
        }
      }
    } catch (e) {
      console.error("Failed to read .env file directly for Firebase credentials:", e);
    }
  } else {
    // If it exists but is a syntax error (like multi-line issues), try reading from file
    try {
      JSON.parse(credentials);
    } catch (err) {
      console.log("Environment credentials failed to parse, falling back to reading .env file directly...");
      try {
        const envPath = path.join(process.cwd(), ".env");
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, "utf8");
          const match = envContent.match(/FIREBASE_ADMIN_CREDENTIALS\s*=\s*({[\s\S]*?^})/m);
          if (match && match[1]) {
            credentials = match[1];
          }
        }
      } catch (e) {
        console.error("Failed to read .env file directly on fallback:", e);
      }
    }
  }
  
  if (credentials) {
    try {
      const serviceAccount = JSON.parse(credentials);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Firebase Admin initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Firebase Admin:", error);
    }
  } else {
    console.log("Firebase Admin credentials not found - using client-side Firestore");
  }
}

export const db = admin.apps.length > 0 ? admin.firestore() : null;
export const auth = admin.apps.length > 0 ? admin.auth() : null;

export default admin;
