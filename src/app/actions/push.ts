'use server';

import { adminDb } from '../../lib/firebase-admin';
import webPush from '../../lib/web-push';

const PUSH_SUBSCRIPTIONS_COLLECTION = 'push_subscriptions';

export async function saveSubscription(subscription: webPush.PushSubscription) {
  if (!adminDb) {
    console.error("Admin DB not initialized, cannot save push subscription.");
    return;
  }
  try {
    // Use a portion of the endpoint as a document ID for easy lookup and deletion
    const subscriptionKey = subscription.endpoint.slice(-32);
    const subscriptionRef = adminDb.collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(subscriptionKey);
    await subscriptionRef.set(subscription);
  } catch (error) {
    console.error("Error saving push subscription to Firestore:", error);
  }
}

export async function deleteSubscription(endpoint: string) {
    if (!adminDb) {
        console.error("Admin DB not initialized, cannot delete push subscription.");
        return;
    }
    try {
        const subscriptionKey = endpoint.slice(-32);
        const subscriptionRef = adminDb.collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(subscriptionKey);
        await subscriptionRef.delete();
    } catch (error) {
        console.error("Error deleting push subscription from Firestore:", error);
    }
}


export async function sendPushNotification({ author, message }: { author: string; message: string; }) {
  if (!adminDb || !process.env.VAPID_PRIVATE_KEY) {
    console.log("Push notifications not configured, skipping.");
    return;
  }

  try {
    const subscriptionsSnapshot = await adminDb.collection(PUSH_SUBSCRIPTIONS_COLLECTION).get();
    if (subscriptionsSnapshot.empty) {
      return;
    }

    const payload = JSON.stringify({
      title: `New message from ${author}`,
      body: message,
      icon: '/icons/icon-192x192.png'
    });

    const sendPromises = subscriptionsSnapshot.docs.map(doc => {
      const subscription = doc.data() as webPush.PushSubscription;
      return webPush.sendNotification(subscription, payload).catch(error => {
        // If subscription is expired or invalid, delete it from Firestore
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`Subscription for ${subscription.endpoint} is invalid, deleting.`);
          return doc.ref.delete();
        } else {
          console.error(`Error sending push notification to ${subscription.endpoint}:`, error);
        }
      });
    });

    await Promise.all(sendPromises);

  } catch (error) {
    console.error("Error sending push notifications:", error);
  }
}
