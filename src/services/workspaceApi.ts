import { getAccessToken } from './googleAuth';
import { AttendanceRecord, ClassScheduleSlot } from '../types/attendance';

// Helper to encode UTF-8 to Base64URL for Gmail API RFC 2822 format
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// -------------------------------------------------------------
// GOOGLE SHEETS API
// -------------------------------------------------------------

export interface SpreadsheetExportResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  rowsInserted: number;
}

/**
 * Creates a brand new attendance spreadsheet in Google Sheets and inserts current records
 */
export async function createAttendanceSpreadsheet(
  title: string,
  records: AttendanceRecord[]
): Promise<SpreadsheetExportResult> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in first.');

  // 1. Create Spreadsheet
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: title || `CUK Chemistry Attendance - ${new Date().toISOString().slice(0, 10)}`,
      },
      sheets: [
        {
          properties: {
            title: 'Attendance Records',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const errorData = await createRes.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to create spreadsheet: ${createRes.statusText}`);
  }

  const createdData = await createRes.json();
  const spreadsheetId = createdData.spreadsheetId;
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 2. Prepare headers and rows
  const headers = [
    'Timestamp',
    'Roll Number',
    'Student Name',
    'Subject',
    'Verification Status',
    'Passcode Hash',
    'Distance from Dept (km)',
    'Logged Geofence Status',
  ];

  const rows = records.map((rec) => [
    new Date(rec.timestamp).toLocaleString(),
    rec.rollNo,
    rec.studentName,
    rec.subject,
    rec.verified ? 'PRESENT' : 'ABSENT',
    rec.receiptHash || 'OTP-VERIFIED',
    rec.distanceKm !== undefined ? rec.distanceKm.toFixed(3) : 'Inside (< 1.5km)',
    rec.distanceKm <= 1.5 ? 'Valid Geofence' : 'Manual Override',
  ]);

  const values = [headers, ...rows];

  // 3. Write rows to spreadsheet
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Attendance Records'!A1:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values,
      }),
    }
  );

  if (!writeRes.ok) {
    const errorData = await writeRes.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to write attendance rows: ${writeRes.statusText}`);
  }

  return {
    spreadsheetId,
    spreadsheetUrl,
    rowsInserted: rows.length,
  };
}

// -------------------------------------------------------------
// GMAIL API
// -------------------------------------------------------------

export interface SendEmailPayload {
  to: string;
  subject: string;
  bodyText: string;
}

/**
 * Sends an email using the Gmail REST API (users/me/messages/send)
 */
export async function sendGmailMessage(payload: SendEmailPayload): Promise<{ id: string; threadId: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in first.');

  const rfc822 = [
    `To: ${payload.to}`,
    `Subject: ${payload.subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    '',
    payload.bodyText,
  ].join('\r\n');

  const raw = base64UrlEncode(rfc822);

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to send email via Gmail: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Lists the user's recent messages from Gmail
 */
export async function listRecentGmailMessages(): Promise<Array<{ id: string; snippet?: string }>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in first.');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to fetch messages: ${res.statusText}`);
  }

  const data = await res.json();
  return data.messages || [];
}

// -------------------------------------------------------------
// GOOGLE CALENDAR API
// -------------------------------------------------------------

export interface CalendarEventPayload {
  summary: string;
  description: string;
  location: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
}

/**
 * Creates an event in the user's primary Google Calendar
 */
export async function createGoogleCalendarEvent(
  event: CalendarEventPayload
): Promise<{ id: string; htmlLink: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in first.');

  const body = {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: {
      dateTime: event.startTime,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
    },
    end: {
      dateTime: event.endTime,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
    },
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to create calendar event: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Fetches upcoming events from the user's primary calendar
 */
export async function listUpcomingCalendarEvents(): Promise<
  Array<{ id: string; summary: string; start: { dateTime?: string; date?: string }; htmlLink: string }>
> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in first.');

  const nowIso = new Date().toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
    nowIso
  )}&maxResults=8&singleEvents=true&orderBy=startTime`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to fetch calendar events: ${res.statusText}`);
  }

  const data = await res.json();
  return data.items || [];
}
