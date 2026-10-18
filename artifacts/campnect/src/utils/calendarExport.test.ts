import test from 'node:test';
import assert from 'node:assert/strict';
import { generateIcsContent, formatIcsDate } from './calendarExport.js';

test('formatIcsDate produces RFC 5545 compatible UTC timestamp', () => {
  const d = new Date('2026-10-18T10:00:00.000Z');
  assert.equal(formatIcsDate(d), '20261018T100000Z');
});

test('generateIcsContent builds compliant VCALENDAR format', () => {
  const ics = generateIcsContent({
    title: 'Hackathon Final Pitch',
    startDate: new Date('2026-10-18T10:00:00.000Z'),
    endDate: new Date('2026-10-18T12:00:00.000Z'),
    location: 'Campus Auditorium',
  });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:Hackathon Final Pitch/);
  assert.match(ics, /LOCATION:Campus Auditorium/);
  assert.match(ics, /END:VCALENDAR/);
});
