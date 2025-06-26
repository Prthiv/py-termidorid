import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getMessaging, type Messaging } from "firebase/messaging";

// Helper function to clean up environment variables
const clean = (value?: string) => (value || '').trim().replace(/["']/g, '');

const firebaseConfig = {
  apiKey: clean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: clean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: clean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: clean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: clean(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: clean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  measurementId: clean(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID)
};

// **DEBUGGING STEP**: Log the cleaned configuration to the console.
console.log("Attempting to initialize Firebase with this configuration:", firebaseConfig);

let app: FirebaseApp;
let db: Firestore | null = null;
let messaging: Messaging | null = null;

try {
  const requiredKeys: (keyof typeof firebaseConfig)[] = ['apiKey', 'authDomain', 'projectId', 'storageBucket'];
  const missingKeys = requiredKeys.filter(key => !firebaseConfig[key]);

  if (missingKeys.length > 0) {
    const errorMessage = `Firebase config from .env file is missing required values for: ${missingKeys.join(', ')}. Please make sure your .env file is set up correctly.`;
    console.error(errorMessage);
    // We will still attempt to initialize in case the environment provides them,
    // but this is a strong warning.
  }
  
  if (!firebaseConfig.projectId || firebaseConfig.projectId.includes('YOUR_')) {
      throw new Error("Your NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set in the .env file. Please add it from your Firebase project settings.");
  }
  
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(app);

  if (typeof window !== 'undefined') {
    messaging = getMessaging(app);
  }

  console.log("Firebase and Firestore initialized successfully.");

} catch (e: any) {
  console.error("CRITICAL: Firebase initialization failed.", e);
}

export { db, messaging };
