
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, addDoc, query, orderBy, onSnapshot, Timestamp, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { encryptMessage, decryptMessage } from '../lib/crypto';
import type { Message, DecryptedMessage } from '../types';
import { useToast } from "./use-toast";
import { useWebRTC } from './useWebRTC';
import { sendPushNotification } from '../app/actions/push';

const CHAT_COLLECTION = 'tty_chat_stream';
const URGENT_NOTIFICATION_TEXT = "*** URGENT NOTIFICATION RECEIVED ***";


export function useChat(secret: string | null, sessionId: string | null) {
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const isClearingChat = useRef(false);

  const { connect, sendFile, receivedFile, isConnected: isWebRTCConnected, cleanup: cleanupWebRTC } = useWebRTC(sessionId);

  useEffect(() => {
    if (receivedFile) {
      setMessages(prev =>
        prev.map(msg => {
          if (msg.id === receivedFile.id) {
            return {
              ...msg,
              text: `Received ${receivedFile.filetype}: ${receivedFile.filename}`,
              localUrl: URL.createObjectURL(receivedFile.blob),
            };
          }
          return msg;
        })
      );
    }
  }, [receivedFile]);

  useEffect(() => {
    if (!secret) {
      setMessages([]);
      setLoading(false);
      return;
    }

    if (!db) {
        toast({
            title: "Database Connection Failed",
            description: "Could not connect to Firestore. Please check your .env configuration and ensure your Firebase project has been created correctly.",
            variant: "destructive",
            duration: Infinity,
        });
        setLoading(false);
        return;
    }

    setLoading(true);
    const q = query(collection(db, CHAT_COLLECTION), orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      if (isClearingChat.current) return;

      const newMessages: DecryptedMessage[] = [];
      for (const doc of querySnapshot.docs) {
        const data = doc.data() as Message;
        try {
            const text = await decryptMessage(data.content, secret);
            newMessages.push({
              id: doc.id,
              author: data.author,
              text,
              timestamp: data.timestamp.toDate(),
              sessionId: data.sessionId,
              messageType: data.messageType || 'text',
              filename: data.filename,
            });
        } catch (e) {
            console.error(`Failed to process message ${doc.id}`, e);
             newMessages.push({
                id: doc.id,
                author: data.author,
                text: '[Could not decrypt message]',
                timestamp: data.timestamp.toDate(),
                sessionId: data.sessionId,
                messageType: data.messageType || 'text',
                filename: data.filename,
              });
        }
      }
      setMessages(newMessages);
      setLoading(false);
    }, (error) => {
      console.error("Firestore listener error: ", error);
      toast({ 
        title: "Real-time Connection Error", 
        description: `This is the final step! The app is being blocked by your Firebase security rules. Please go to your Firebase Console, open Firestore > Rules, and set them to 'allow read, write: if (true);' for development. The specific error was: "${error.message}"`, 
        variant: "destructive",
        duration: Infinity
      });
      setLoading(false);
    });

    return () => {
      unsubscribe();
      cleanupWebRTC();
    };
  }, [secret, toast, cleanupWebRTC]);

  const sendMessage = useCallback(async (
    content: string, 
    author: string, 
    sessionId: string,
    isUrgent: boolean = false
  ) => {
    if (!secret || !content.trim() || !sessionId) return;
    if (!db) {
        toast({ title: "Error Sending Message", description: "Cannot send message, database not connected.", variant: "destructive", duration: Infinity });
        return;
    }

    try {
      const encryptedContent = await encryptMessage(content, secret);
      
      const docData: Omit<Message, 'id'> = {
        author,
        content: encryptedContent,
        timestamp: Timestamp.now(),
        sessionId,
        messageType: 'text',
      };
      
      await addDoc(collection(db, CHAT_COLLECTION), docData);

      const notificationMessage = isUrgent ? "You have received a new message." : content;
      sendPushNotification({ author, message: notificationMessage });

    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({ 
        title: "Error Sending Message", 
        description: `Could not send your message. The backend returned an error: "${error.message}". Please check your Firebase project settings and security rules.`, 
        variant: "destructive",
        duration: Infinity,
      });
    }
  }, [secret, toast]);

  const sendUrgentNotificationMessage = useCallback(async (author: string, sessionId: string) => {
    sendMessage(URGENT_NOTIFICATION_TEXT, author, sessionId, true);
  }, [sendMessage]);


  const sendFileMessage = useCallback(async (
    file: File,
    author: string,
    sessionId: string
  ) => {
    if (!secret || !file || !sessionId || !db) {
        toast({ title: "File Upload Error", description: "Cannot send file, system not ready.", variant: "destructive" });
        return;
    }

    const messageType = file.type.startsWith('video/') ? 'video' : 'image';
    
    const placeholderContent = `[pending file transfer: ${file.name}]`;
    const encryptedPlaceholder = await encryptMessage(placeholderContent, secret);

    const docRef = await addDoc(collection(db, CHAT_COLLECTION), {
      author,
      content: encryptedPlaceholder,
      timestamp: Timestamp.now(),
      sessionId,
      messageType: messageType,
      filename: file.name
    });
    
    sendPushNotification({ author, message: `Sending a file: ${file.name}` });
    
    await sendFile(file, docRef.id);

  }, [secret, sendFile, toast]);

  const clearChatHistory = useCallback(async () => {
    if (!secret || !db) {
        toast({ title: "Error Clearing Chat", description: "Cannot clear chat, not authenticated or database not connected.", variant: "destructive" });
        return;
    }
    
    isClearingChat.current = true;
    setLoading(true);
    setMessages([]);
    
    try {
        const chatCollectionRef = collection(db, CHAT_COLLECTION);
        const querySnapshot = await getDocs(chatCollectionRef);
        const deletePromises: Promise<void>[] = [];
        querySnapshot.forEach((docSnapshot) => {
            deletePromises.push(deleteDoc(docSnapshot.ref));
        });
        await Promise.all(deletePromises);
        toast({ title: "Chat Cleared", description: "All messages have been permanently deleted."});
    } catch (error: any) {
        console.error("Error clearing chat history:", error);
        toast({ title: "Error", description: "Failed to clear chat history.", variant: "destructive" });
    } finally {
        isClearingChat.current = false;
        setLoading(false);
    }
  }, [secret, toast]);


  return { messages, loading, sendMessage, sendUrgentNotificationMessage, sendFileMessage, connectWebRTC: connect, isWebRTCConnected, clearChatHistory, urgentNotificationText: URGENT_NOTIFICATION_TEXT };
}
