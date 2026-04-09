import { google } from 'googleapis';
import { config } from './config.js';

let authClient: ReturnType<typeof google.auth.JWT.prototype.authorize> extends Promise<infer T> ? T : never;

export function getGoogleAuth() {
  return new google.auth.JWT(
    config.google.serviceAccountEmail,
    undefined,
    config.google.privateKey,
    [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/analytics.readonly',
    ]
  );
}

export function getSheets() {
  return google.sheets({ version: 'v4', auth: getGoogleAuth() });
}

export function getCalendar() {
  return google.calendar({ version: 'v3', auth: getGoogleAuth() });
}

export function getDocs() {
  return google.docs({ version: 'v1', auth: getGoogleAuth() });
}

export function getDrive() {
  return google.drive({ version: 'v3', auth: getGoogleAuth() });
}
