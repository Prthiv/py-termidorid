'use client';

import { useState, useEffect, useCallback } from 'react';
import { getToken, isSupported } from 'firebase/messaging';
import { db, messaging } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { useToast } from './use-toast';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const FCM_TOKENS_COLLECTION = 'fcm_tokens';

export function usePushNotifications() {
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const initialize = useCallback(async (sessionId: string | null) => {
    if (!sessionId || !(await isSupported()) || !messaging || !VAPID_KEY) {
      if (!VAPID_KEY) {
        console.error("VAPID key is missing. Push notifications will not work. Add NEXT_PUBLIC_FIREBASE_VAPID_KEY to your .env file.");
      }
      return;
    }

    try {
      const currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);

      if (currentPermission === 'granted') {
        const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
        if (currentToken) {
          console.log('FCM Token:', currentToken);
          // Save the token to Firestore
          const tokenRef = doc(db, FCM_TOKENS_COLLECTION, sessionId);
          await setDoc(tokenRef, { token: currentToken, sessionId: sessionId, createdAt: new Date() });
        } else {
          console.log('No registration token available. Request permission to generate one.');
          toast({
            title: "Notification Permission",
            description: "Could not get a notification token. Please try again or re-enable permissions.",
            variant: "destructive"
          });
        }
      } else {
        console.log('Unable to get permission to notify.');
        toast({
            title: "Notification Permission Denied",
            description: "You will not receive push notifications for new messages.",
        });
      }
    } catch (error) {
      console.error('An error occurred while retrieving token. ', error);
    }
  }, [toast]);
  
  const cleanupTokens = useCallback(async (sessionId: string | null) => {
      if (!sessionId || !db) return;
      try {
        // Delete the specific token for this session
        const tokenRef = doc(db, FCM_TOKENS_COLLECTION, sessionId);
        await deleteDoc(tokenRef);

        // Optional: Clean up old tokens (e.g., older than 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const oldTokensQuery = query(collection(db, FCM_TOKENS_COLLECTION), where("createdAt", "<", thirtyDaysAgo));
        const oldTokensSnapshot = await getDocs(oldTokensQuery);
        const deletePromises = oldTokensSnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);

      } catch (error) {
          console.error("Error cleaning up FCM tokens:", error);
      }
  }, []);

  return { initialize, cleanupTokens, permission };
}
