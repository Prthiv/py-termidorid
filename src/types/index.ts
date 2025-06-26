
import type { Timestamp } from 'firebase/firestore';

export interface Message {
  id: string;
  author: string;
  content: string; // Encrypted text OR placeholder text for file transfers
  timestamp: Timestamp;
  sessionId?: string;
  messageType?: 'text' | 'image' | 'video'; // Type of the final content
  filename?: string;
}

export interface DecryptedMessage {
  id:string;
  author: string;
  text: string; // Decrypted content (text, or placeholder for files)
  timestamp: Date;
  sessionId?: string;
  messageType?: 'text' | 'image' | 'video'; // Type of the final content
  filename?: string;
  localUrl?: string; // Will hold the blob URL for received files
}

export interface User {
  username: string;
}
