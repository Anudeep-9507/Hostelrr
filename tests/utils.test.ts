import assert from 'node:assert/strict';
import test from 'node:test';
import { addDaysToDateOnly, addMonthsToDateOnly, formatDate, formatTimeIST, getResidentPaymentStateForDate, getTodayIST, getWhatsAppUrl, isResidentReserved, isValidPartialPaymentAmount } from '../src/lib/utils';
import { buildRentReminderMessage } from '../src/lib/reminderTemplate';

test('getTodayIST derives the calendar date from the IST boundary', () => {
  assert.equal(getTodayIST(new Date('2025-01-01T18:29:59.999Z')), '2025-01-01');
  assert.equal(getTodayIST(new Date('2025-01-01T18:30:00.000Z')), '2025-01-02');
  assert.equal(getTodayIST(new Date('2024-12-31T18:30:00.000Z')), '2025-01-01');
});

test('date-only month arithmetic permanently clamps month-end dates', () => {
  assert.equal(addMonthsToDateOnly('2025-01-31', 1), '2025-02-28');
  assert.equal(addMonthsToDateOnly('2025-02-28', 1), '2025-03-28');
  assert.equal(addMonthsToDateOnly('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonthsToDateOnly('invalid', 1), 'invalid');
});

test('date-only day arithmetic crosses month and year boundaries', () => {
  assert.equal(addDaysToDateOnly('2024-12-31', 1), '2025-01-01');
  assert.equal(addDaysToDateOnly('2025-03-01', -1), '2025-02-28');
});

test('joining-date rent badge stays clear before due date and becomes pending then late', () => {
  const cycle = { status: 'pending', due_date: '2025-03-08', paid_amount: 0, total_amount: 8000 };
  assert.deepEqual(getResidentPaymentStateForDate([cycle], '2025-03-07'), { paymentStatus: 'paid', dueAmount: 0, pendingDueToday: false, nextDueDate: '2025-03-08' });
  assert.deepEqual(getResidentPaymentStateForDate([cycle], '2025-03-08'), { paymentStatus: 'due', dueAmount: 8000, pendingDueToday: true, nextDueDate: '2025-03-08' });
  assert.deepEqual(getResidentPaymentStateForDate([cycle], '2025-03-09'), { paymentStatus: 'late', dueAmount: 8000, pendingDueToday: false, nextDueDate: '2025-03-08' });
});

test('previous unpaid cycle remains late when next joining-date cycle is due', () => {
  const cycles = [
    { status: 'late', due_date: '2025-03-08', paid_amount: 0, total_amount: 8000 },
    { status: 'pending', due_date: '2025-04-08', paid_amount: 0, total_amount: 8000 },
  ];
  assert.deepEqual(getResidentPaymentStateForDate(cycles, '2025-04-08'), {
    paymentStatus: 'late',
    dueAmount: 16000,
    pendingDueToday: true,
    nextDueDate: '2025-03-08',
  });
});

test('resident has no rent badge after all due cycles are settled', () => {
  const cycles = [
    { status: 'paid', due_date: '2025-03-08', paid_amount: 8000, total_amount: 8000 },
    { status: 'pending', due_date: '2025-04-08', paid_amount: 0, total_amount: 8000 },
  ];
  assert.deepEqual(getResidentPaymentStateForDate(cycles, '2025-03-09'), { paymentStatus: 'paid', dueAmount: 0, pendingDueToday: false, nextDueDate: '2025-04-08' });
});

test('reserved residents and reserved beds stay out of paid resident set', () => {
  const floors = [{ id: 'f1', level: 1, name: 'Floor 1', rooms: [{
    id: 'r1', number: '1', beds: [{ id: 'b1', name: 'A', status: 'reserved' as const }],
  }] }];
  assert.equal(isResidentReserved({ status: 'active', roomId: 'r1', bedId: 'b1' }, floors), true);
  assert.equal(isResidentReserved({ status: 'reserved', roomId: 'r1', bedId: 'b2' }, floors), true);
  assert.equal(isResidentReserved({ status: 'active', roomId: 'r1', bedId: 'b2' }, floors), false);
});

test('partially paid cycle becomes late after its due date', () => {
  const cycle = { status: 'partial', due_date: '2025-03-08', paid_amount: 3000, total_amount: 8000 };
  assert.equal(getResidentPaymentStateForDate([cycle], '2025-03-08').paymentStatus, 'partially_paid');
  assert.equal(getResidentPaymentStateForDate([cycle], '2025-03-09').paymentStatus, 'late');
});

test('partial payment amount cannot exceed outstanding balance', () => {
  assert.equal(isValidPartialPaymentAmount('250', 250), true);
  assert.equal(isValidPartialPaymentAmount(1, 250), true);
  assert.equal(isValidPartialPaymentAmount('8000', 250), false);
  assert.equal(isValidPartialPaymentAmount('', 250), false);
  assert.equal(isValidPartialPaymentAmount('2.5', 250), false);
});

test('timestamp display uses the IST calendar date and time', () => {
  assert.equal(formatDate('2025-01-01T20:00:00.000Z'), '02-01-2025');
  assert.match(formatTimeIST('2025-01-01T18:30:00.000Z'), /12:00/);
  assert.equal(formatDate('2025-01-02'), '02-01-2025');
});

test('manual WhatsApp links accept valid Indian mobile formats only', () => {
  assert.equal(getWhatsAppUrl('+91 98765 43210', 'Rent due'), 'https://wa.me/919876543210?text=Rent%20due');
  assert.equal(getWhatsAppUrl('09876543210', 'Rent due'), 'https://wa.me/919876543210?text=Rent%20due');
  assert.equal(getWhatsAppUrl('9876543210', 'Rent due'), 'https://wa.me/919876543210?text=Rent%20due');
  assert.equal(getWhatsAppUrl('12345', 'Rent due'), null);
  assert.equal(getWhatsAppUrl('+1 212 555 0100', 'Rent due'), null);
});

test('WhatsApp rent reminders use the selected hostel template', () => {
  const message = buildRentReminderMessage(
    'Namaste {{name}}, pending rent is ₹{{amount}} for Room {{room}}.\nPlease pay by {{due_date}}.\n- {{hostel_name}}',
    { name: 'Arun', amount: 4500, room: 'A-12', dueDate: '20-11-2026', hostelName: 'Green Hostel' },
  );

  assert.equal(
    message,
    'Namaste Arun, pending rent is ₹4500 for Room A-12.\nPlease pay by 20-11-2026.\n- Green Hostel\n\nPowered by Hostelrr',
  );
});
