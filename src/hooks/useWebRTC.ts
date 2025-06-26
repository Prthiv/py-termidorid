
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../lib/firebase';
import {
  collection,
  doc,
  addDoc,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  getDoc,
  updateDoc,
} from 'firebase/firestore';

// This creates a predictable, shared room name based on a "secret".
// In a real multi-room app, this would be dynamically generated.
const a = 'appulinuappu'; 
const ROOM_NAME = `webrtc-room-${a}`;
const CHUNK_SIZE = 64 * 1024; // 64KB

// Public STUN servers provided by Google.
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

export function useWebRTC(sessionId: string | null) {
  const pc = useRef<RTCPeerConnection | null>(null);
  const sendChannel = useRef<RTCDataChannel | null>(null);
  const candidateQueue = useRef<RTCIceCandidate[]>([]);

  const [isConnected, setIsConnected] = useState(false);
  const [receivedFile, setReceivedFile] = useState<{ id: string; blob: Blob; filename: string; filetype: string } | null>(null);

  // State for re-assembling file chunks
  const receivingFileMetadata = useRef<any>(null);
  const receivingFileChunks = useRef<ArrayBuffer[]>([]);

  const cleanup = useCallback(async () => {
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
    if (sendChannel.current) {
        sendChannel.current.close();
        sendChannel.current = null;
    }
    setIsConnected(false);
    candidateQueue.current = [];

    // Clean up signaling documents in Firestore
    if (db) {
        try {
            const roomRef = doc(db, 'webrtc_rooms', ROOM_NAME);
            const callerCandidates = collection(roomRef, 'callerCandidates');
            const calleeCandidates = collection(roomRef, 'calleeCandidates');
            
            const [callerSnaps, calleeSnaps] = await Promise.all([
                getDocs(callerCandidates),
                getDocs(calleeCandidates)
            ]);

            const deletions: Promise<void>[] = [];
            callerSnaps.forEach(doc => deletions.push(deleteDoc(doc.ref)));
            calleeSnaps.forEach(doc => deletions.push(deleteDoc(doc.ref)));
            await Promise.all(deletions);

            const roomDoc = await getDoc(roomRef);
            if(roomDoc.exists()) {
              await deleteDoc(roomRef);
            }
        } catch (error) {
            // This can fail if the other user cleans up first, which is fine.
            // console.warn("Cleanup failed, likely because room is already gone:", error);
        }
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const handleReceiveMessage = useCallback((event: MessageEvent) => {
    if (typeof event.data === 'string') {
        const data = JSON.parse(event.data);
        if (data.type === 'metadata') {
            receivingFileMetadata.current = data;
            receivingFileChunks.current = [];
        } else if (data.type === 'end') {
            if (receivingFileMetadata.current && receivingFileMetadata.current.id === data.id) {
                const fileBlob = new Blob(receivingFileChunks.current, { type: receivingFileMetadata.current.filetype });
                setReceivedFile({
                    id: data.id,
                    blob: fileBlob,
                    filename: receivingFileMetadata.current.filename,
                    filetype: receivingFileMetadata.current.filetype,
                });
                // Reset for next transfer
                receivingFileMetadata.current = null;
                receivingFileChunks.current = [];
            }
        }
    } else if (event.data instanceof ArrayBuffer) {
        // This is a file chunk
        if(receivingFileMetadata.current){
            receivingFileChunks.current.push(event.data);
        }
    }
  }, []);

  const setupPeerConnection = useCallback(() => {
    const newPc = new RTCPeerConnection(servers);

    newPc.ondatachannel = (event) => {
      const receiveChannel = event.channel;
      receiveChannel.binaryType = 'arraybuffer';
      receiveChannel.onmessage = handleReceiveMessage;
      receiveChannel.onopen = () => setIsConnected(true);
      receiveChannel.onclose = () => setIsConnected(false);
    };

    pc.current = newPc;
  }, [handleReceiveMessage]);
  
  const connect = useCallback(async () => {
    if (!db || !sessionId || pc.current) return;

    setupPeerConnection();

    const roomRef = doc(db, 'webrtc_rooms', ROOM_NAME);
    let roomSnapshot = await getDoc(roomRef);
    
    const callerCandidates = collection(roomRef, 'callerCandidates');
    const calleeCandidates = collection(roomRef, 'calleeCandidates');

    // If I created the room (e.g. I was the caller and refreshed), clear it to start over.
    if (roomSnapshot.exists() && roomSnapshot.data().callerSessionId === sessionId) {
        const [callerSnaps, calleeSnaps] = await Promise.all([
            getDocs(callerCandidates),
            getDocs(calleeCandidates)
        ]);
        const deletions: Promise<void>[] = [];
        callerSnaps.forEach(doc => deletions.push(deleteDoc(doc.ref)));
        calleeSnaps.forEach(doc => deletions.push(deleteDoc(doc.ref)));
        await Promise.all(deletions);
        await deleteDoc(roomRef);
        
        roomSnapshot = await getDoc(roomRef); // Re-fetch snapshot, it will now be non-existent.
    }

    if (!roomSnapshot.exists()) {
      // --- I am the CALLER ---
      sendChannel.current = pc.current!.createDataChannel('fileSendChannel');
      sendChannel.current.binaryType = 'arraybuffer';
      sendChannel.current.onopen = () => setIsConnected(true);
      sendChannel.current.onclose = () => setIsConnected(false);

      pc.current!.onicecandidate = event => {
        if (event.candidate) addDoc(callerCandidates, event.candidate.toJSON());
      };

      const offerDescription = await pc.current!.createOffer();
      await pc.current!.setLocalDescription(offerDescription);
      await setDoc(roomRef, {
        offer: { sdp: offerDescription.sdp, type: offerDescription.type },
        callerSessionId: sessionId // Store caller's ID to handle refreshes
      });

      // Listen for answer and callee's ICE candidates
      onSnapshot(roomRef, async (snapshot) => {
        if (!pc.current) return; // Guard against race condition on unmount

        const data = snapshot.data();
        if (!pc.current.currentRemoteDescription && data?.answer) {
          try {
            const answer = new RTCSessionDescription(data.answer);
            await pc.current.setRemoteDescription(answer);

            candidateQueue.current.forEach(candidate => {
              pc.current?.addIceCandidate(candidate).catch(e => console.error("Error adding queued ICE candidate:", e));
            });
            candidateQueue.current = [];
          } catch (e) {
            console.error("Error setting remote description:", e);
          }
        }
      });

      onSnapshot(calleeCandidates, snapshot => {
        if (!pc.current) return; // Guard against race condition on unmount

        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            if (pc.current?.remoteDescription) {
              pc.current.addIceCandidate(candidate).catch(e => console.error("Error adding ICE candidate:", e));
            } else {
              candidateQueue.current.push(candidate);
            }
          }
        });
      });

    } else {
      // --- I am the CALLEE ---
      pc.current!.onicecandidate = event => {
        if (event.candidate) addDoc(calleeCandidates, event.candidate.toJSON());
      };

      const offer = roomSnapshot.data().offer;
      await pc.current!.setRemoteDescription(new RTCSessionDescription(offer));
      const answerDescription = await pc.current!.createAnswer();
      await pc.current!.setLocalDescription(answerDescription);
      await updateDoc(roomRef, { answer: { type: answerDescription.type, sdp: answerDescription.sdp } });

      // Listen for caller's ICE candidates
      onSnapshot(callerCandidates, snapshot => {
        if (!pc.current) return; // Guard against race condition on unmount

        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            pc.current?.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(e => console.error("Error adding ICE candidate:", e));
          }
        });
      });
    }
  }, [sessionId, setupPeerConnection, cleanup]);

  const sendFile = useCallback(async (file: File, messageId: string) => {
    if (!sendChannel.current || sendChannel.current.readyState !== 'open') {
      console.error('Send channel is not open.');
      return;
    }
    
    // 1. Send metadata (as a string)
    sendChannel.current.send(JSON.stringify({
        type: 'metadata',
        id: messageId,
        filename: file.name,
        filetype: file.type,
    }));
    
    // 2. Send chunks (as ArrayBuffer)
    let offset = 0;
    const fileReader = new FileReader();

    const readSlice = (o: number) => {
        const slice = file.slice(o, o + CHUNK_SIZE);
        fileReader.readAsArrayBuffer(slice);
    };

    fileReader.onload = (e) => {
        const chunk = e.target?.result as ArrayBuffer;
        if (sendChannel.current?.readyState === 'open') {
            try {
              sendChannel.current.send(chunk);
              offset += chunk.byteLength;
              if (offset < file.size) {
                  readSlice(offset);
              } else {
                  // 3. Send end message
                  sendChannel.current.send(JSON.stringify({ type: 'end', id: messageId }));
              }
            } catch (error) {
              console.error("Send failed:", error);
            }
        }
    };
    readSlice(0);
  }, []);

  return { connect, sendFile, isConnected, receivedFile, cleanup };
}
