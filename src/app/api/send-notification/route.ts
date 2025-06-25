import { NextResponse } from 'next/server';
import { adminMessaging } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  if (!adminMessaging) {
    return NextResponse.json(
      { error: 'Firebase Admin not configured, cannot send notification.' },
      { status: 500 }
    );
  }

  try {
    const { token, title, body } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'FCM token is required.' }, { status: 400 });
    }

    const message = {
      notification: {
        title: title || 'New Message',
        body: body || 'You have a new message.',
      },
      token: token,
    };

    const response = await adminMessaging.send(message);
    console.log('Successfully sent message:', response);
    return NextResponse.json({ success: true, response });

  } catch (error: any) {
    console.error('Error sending FCM message:', error);
    return NextResponse.json(
      { error: 'Failed to send notification', details: error.message },
      { status: 500 }
    );
  }
}
