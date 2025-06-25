const KEY_SALT = 'ttyLove-salt';
const IV_LENGTH = 12; // For AES-GCM

// Helper function to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper function to convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(KEY_SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessage(text: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encodedText = new TextEncoder().encode(text);

  const encryptedContent = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encodedText
  );

  const encryptedBytes = new Uint8Array(encryptedContent);
  const result = new Uint8Array(iv.length + encryptedBytes.length);
  result.set(iv);
  result.set(encryptedBytes, iv.length);

  return arrayBufferToBase64(result.buffer);
}

export async function decryptMessage(encryptedText: string, secret: string): Promise<string> {
  // It's possible that old, unencrypted data exists in the database.
  // We'll check if the string is valid Base64 before trying to decode it.
  const isBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encryptedText);

  if (!isBase64) {
    console.warn('A message was not in Base64 format and could not be decrypted:', `"${encryptedText}"`);
    return '[Message is not encrypted or is corrupted]';
  }

  try {
    const key = await getKey(secret);
    const encryptedDataBuffer = base64ToArrayBuffer(encryptedText);
    const encryptedData = new Uint8Array(encryptedDataBuffer);
    
    if (encryptedData.length < IV_LENGTH) {
        throw new Error("Encrypted data is too short to be valid.");
    }

    const iv = encryptedData.slice(0, IV_LENGTH);
    const encryptedContent = encryptedData.slice(IV_LENGTH);

    const decryptedContent = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      encryptedContent
    );

    return new TextDecoder().decode(decryptedContent);
  } catch (error) {
    console.error('Decryption failed for a message. It may have been encrypted with a different key.', error);
    return '[Decryption failed: Incorrect key or corrupted data]';
  }
}
