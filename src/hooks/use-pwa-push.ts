'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from './use-toast';
import { saveSubscription, deleteSubscription } from '../app/actions/push';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}


export function usePwaPush() {
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const registerServiceWorker = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        return registration;
      } catch (error) {
        console.error('Service Worker registration failed: ', error);
        return null;
      }
    }
    return null;
  }, []);
  
  useEffect(() => {
    const checkSubscription = async () => {
        setIsLoading(true);
        const registration = await navigator.serviceWorker.ready;
        const currentSubscription = await registration.pushManager.getSubscription();
        if (currentSubscription) {
            setSubscription(currentSubscription);
            setIsSubscribed(true);
        }
        setIsLoading(false);
    };

    if ('serviceWorker' in navigator && 'PushManager' in window) {
      registerServiceWorker().then(() => checkSubscription());
    } else {
        setIsLoading(false);
    }
  }, [registerServiceWorker]);


  const subscribe = useCallback(async () => {
    if (isSubscribed || !('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY) {
        if (!VAPID_PUBLIC_KEY) {
            console.error("VAPID public key not found. Cannot subscribe for push notifications.");
        }
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    try {
        const currentSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        await saveSubscription(currentSubscription.toJSON());
        
        setSubscription(currentSubscription);
        setIsSubscribed(true);

        toast({
            title: "Notifications Enabled",
            description: "You will now receive notifications for new messages."
        });

    } catch (error) {
      console.error('Failed to subscribe the user: ', error);
      toast({
        title: "Notification Error",
        description: "Could not enable push notifications.",
        variant: "destructive"
      });
    }
  }, [isSubscribed, toast]);

  const unsubscribe = useCallback(async () => {
    if (!subscription) return;
    
    try {
        await subscription.unsubscribe();
        await deleteSubscription(subscription.endpoint);

        setSubscription(null);
        setIsSubscribed(false);
        
        toast({
            title: "Notifications Disabled"
        });
    } catch(error) {
        console.error("Failed to unsubscribe: ", error);
        toast({
            title: "Unsubscribe Error",
            description: "Could not disable push notifications.",
            variant: "destructive"
        });
    }

  }, [subscription, toast]);
  

  return { isSubscribed, subscribe, unsubscribe, isLoading };
}
