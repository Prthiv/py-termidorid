'use server';

import { adminDb, adminMessaging } from '../../lib/firebase-admin';

interface SendNotificationPayload {
  author: string;
  message: string;
  senderSessionId: string;
}

export async function sendNotification({ author, message, senderSessionId }: SendNotificationPayload) {
  if (!adminMessaging || !adminDb) {
    console.log("Admin SDK not initialized, skipping notification.");
    return;
  }

  try {
    const allTokensSnapshot = await adminDb.collection('fcm_tokens').get();
    
    if (allTokensSnapshot.empty) {
      console.log("No FCM tokens found to send notifications to.");
      return;
    }

    // Filter out the sender's token
    const recipientTokens = allTokensSnapshot.docs
      .map(doc => doc.data())
      .filter(data => data.sessionId !== senderSessionId && data.token)
      .map(data => data.token);

    if (recipientTokens.length === 0) {
      console.log("No other users to notify.");
      return;
    }

    const payload = {
      notification: {
        title: `New message from ${author}`,
        body: message,
        icon: '/icons/icon-192x192.png'
      }
    };
    
    console.log(`Sending notification to ${recipientTokens.length} devices.`);
    const response = await adminMessaging.sendToDevice(recipientTokens, payload);
    
    // You can optionally handle errors for specific tokens
    response.results.forEach((result, index) => {
      const error = result.error;
      if (error) {
        console.error('Failure sending notification to', recipientTokens[index], error);
        // Here you might want to clean up invalid tokens from your database
      }
    });

  } catch (error) {
    console.error("Error sending push notification:", error);
  }
}
