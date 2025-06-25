'use server';

import admin from 'firebase-admin';

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

const requiredKeys: (keyof typeof serviceAccount)[] = ['projectId', 'clientEmail', 'privateKey'];
const missingKeys = requiredKeys.filter(key => !serviceAccount[key]);

if (missingKeys.length > 0) {
  console.warn(
    `Firebase Admin SDK is not configured. The following environment variables are missing: ${missingKeys.join(
      ', '
    )}. Push notifications will fail. Please add them to your .env file.`
  );
} else if (admin.apps.length === 0) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error: any) {
    console.error('Firebase Admin SDK initialization error:', error.message);
  }
}

export const adminDb = admin.apps.length > 0 ? admin.firestore() : null;
export const adminMessaging = admin.apps.length > 0 ? admin.messaging() : null;
