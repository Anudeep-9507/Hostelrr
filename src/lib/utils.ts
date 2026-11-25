import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Floor, Resident } from "../data/mock";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Get today's date in IST timezone as YYYY-MM-DD format
export function getTodayIST(now: Date = new Date()): string {
  // IST is UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds from UTC
  const istDate = new Date(now.getTime() + istOffset);
  
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isResidentReserved(
  resident: Pick<Resident, 'status' | 'roomId' | 'bedId'>,
  floors: Floor[],
): boolean {
  return resident.status === 'reserved' || floors.some(floor =>
    floor.rooms.some(room => room.id === resident.roomId && room.beds.some(bed =>
      bed.id === resident.bedId && bed.status === 'reserved'
    ))
  );
}

export function getResidentPaymentStateForDate(
  cycles: Array<{ status: string; due_date: string; paid_amount: number; total_amount: number }>,
  today: string,
): { paymentStatus: Resident['paymentStatus']; dueAmount: number; pendingDueToday: boolean; nextDueDate?: string } {
  const openCycles = cycles.filter(cycle =>
    ['pending', 'partial', 'late', 'overdue'].includes(cycle.status) &&
    Number(cycle.paid_amount) < Number(cycle.total_amount)
  );
  const dueCycles = openCycles.filter(cycle => String(cycle.due_date).slice(0, 10) <= today);
  const lateCycles = dueCycles.filter(cycle => String(cycle.due_date).slice(0, 10) < today);
  const dueTodayCycles = dueCycles.filter(cycle => String(cycle.due_date).slice(0, 10) === today);
  const paymentStatus: Resident['paymentStatus'] = lateCycles.length > 0
    ? 'late'
    : dueTodayCycles.length === 0
      ? 'paid'
      : dueTodayCycles.some(cycle => Number(cycle.paid_amount) > 0)
        ? 'partially_paid'
        : 'due';

  return {
    paymentStatus,
    dueAmount: dueCycles.reduce((sum, cycle) => sum + Math.max(0, Number(cycle.total_amount) - Number(cycle.paid_amount)), 0),
    pendingDueToday: openCycles.some(cycle =>
      cycle.status === 'pending' && String(cycle.due_date).slice(0, 10) === today
    ),
    nextDueDate: openCycles
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0]?.due_date,
  };
}

export function getWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  const internationalNumber = digits.length === 10
    ? `91${digits}`
    : digits.length === 12 && digits.startsWith('91')
      ? digits
      : null;
  if (!internationalNumber) return null;
  return `https://wa.me/${internationalNumber}?text=${encodeURIComponent(message)}`;
}

// Date-only arithmetic stays on the calendar date instead of parsing at UTC
// midnight and then drifting when the browser is in a different timezone.
export function addMonthsToDateOnly(dateString: string, months = 1): string {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateString;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const targetMonth = new Date(Date.UTC(year, monthIndex + months, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);

  return `${targetMonth.getUTCFullYear()}-${String(targetMonth.getUTCMonth() + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export function addDaysToDateOnly(dateString: string, days: number): string {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateString;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

// Format time in IST timezone
export function formatTimeIST(dateString: string): string {
  const dateOnlyMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = dateOnlyMatch ? new Date(`${dateString}T00:00:00+05:30`) : new Date(dateString);
  if (isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

// Get current time in IST
export function getTimeIST(): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date());
}

// Convert a date to IST Date object
export function convertToIST(date: Date): Date {
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  return new Date(date.getTime() + istOffset);
}

// Get current IST time as HH:MM:SS
export function getCurrentTimeIST(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

// Calculate a numeric sort key for a payment/transaction to order by recent date and recent time (in IST)
export function getTransactionSortTimestamp(item: { date?: string; recordedAt?: string } | string | null | undefined): number {
  if (!item) return 0;
  const dateStr = typeof item === 'string' ? item : (item.date || '');
  const recordedAtStr = typeof item === 'object' && item?.recordedAt ? item.recordedAt : '';

  // 1. Determine Date components (year, month, day) in IST
  let year = 0;
  let month = 0;
  let day = 0;

  const simpleDateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (simpleDateMatch) {
    year = Number(simpleDateMatch[1]);
    month = Number(simpleDateMatch[2]);
    day = Number(simpleDateMatch[3]);
  } else if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const ist = convertToIST(d);
      year = ist.getUTCFullYear();
      month = ist.getUTCMonth() + 1;
      day = ist.getUTCDate();
    }
  }

  if (!year) return 0;

  // 2. Determine Time components (hours, minutes, seconds, milliseconds) in IST
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let millis = 0;

  const timeSource = recordedAtStr || dateStr;
  if (timeSource && !timeSource.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const t = new Date(timeSource);
    if (!isNaN(t.getTime())) {
      const ist = convertToIST(t);
      hours = ist.getUTCHours();
      minutes = ist.getUTCMinutes();
      seconds = ist.getUTCSeconds();
      millis = ist.getUTCMilliseconds();
    }
  }

  return Date.UTC(year, month - 1, day, hours, minutes, seconds, millis);
}

export function formatDate(dateString: string) {
  if (!dateString) return '';
  
  // Handle YYYY-MM-DD format
  const simpleDateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (simpleDateMatch) {
    const [, year, month, day] = simpleDateMatch;
    return `${day}-${month}-${year}`;
  }
  
  // Handle ISO format or any other date string
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.day}-${values.month}-${values.year}`;
}

export function normalizeBedLabel(value?: string | null): string {
  if (!value) return '';

  const trimmed = value.trim();
  const unwrapped = trimmed.replace(/^Bed\s+/i, '').trim();
  if (!unwrapped) return '';

  if (/^\d+$/.test(unwrapped)) return unwrapped;

  if (/^[A-Z]$/i.test(unwrapped)) {
    return String(unwrapped.toUpperCase().charCodeAt(0) - 64);
  }

  return unwrapped;
}

export function formatBedLabel(value?: string | null): string {
  const normalized = normalizeBedLabel(value);
  return normalized ? `Bed ${normalized}` : '';
}

export function compareBedLabels(a?: string | null, b?: string | null): number {
  const left = normalizeBedLabel(a);
  const right = normalizeBedLabel(b);

  const leftNum = Number(left);
  const rightNum = Number(right);
  if (Number.isFinite(leftNum) && Number.isFinite(rightNum) && leftNum !== rightNum) {
    return leftNum - rightNum;
  }

  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

export function compareRoomNumbers(a?: string | null, b?: string | null): number {
  return (a || '').localeCompare(b || '', undefined, { numeric: true, sensitivity: 'base' });
}

export function normalizeBedLayoutPositions(
  positions: Record<string, { x: number; y: number; rotated: boolean }>
): Record<string, { x: number; y: number; rotated: boolean }> {
  return Object.entries(positions || {}).reduce<Record<string, { x: number; y: number; rotated: boolean }>>((acc, [label, position]) => {
    const normalized = normalizeBedLabel(label);
    if (normalized) {
      acc[normalized] = position;
    }
    return acc;
  }, {});
}

export function getNamesFromIds(floors: Floor[], roomId: string | undefined, bedId: string | undefined) {
  let roomName = roomId?.replace('r', '') || '';
  let bedName = '';

  if (!floors || !roomId) return { roomName, bedName };

  for (const floor of floors) {
    for (const room of floor.rooms) {
      if (room.id === roomId) {
        roomName = room.number || roomName;
        if (bedId) {
          const bed = room.beds.find(b => b.id === bedId);
          if (bed) {
            bedName = normalizeBedLabel(bed.name) || bedName;
          }
        }
        return { roomName, bedName };
      }
    }
  }

  return { roomName, bedName };
}

export function getRoomBaseRent(floors: Floor[], roomId: string | undefined): number {
  if (!floors || !roomId) return 0;

  for (const floor of floors) {
    for (const room of floor.rooms) {
      if (room.id === roomId) {
        return Number(room.baseRent) || 0;
      }
    }
  }

  return 0;
}

export function getResidentRentAmount(resident: Pick<Resident, 'roomId' | 'monthlyRent' | 'dueAmount'> | null | undefined, floors: Floor[]): number {
  if (!resident) return 0;

  const monthlyRent = Number(resident.monthlyRent);
  if (monthlyRent > 0) return monthlyRent;

  const dueAmount = Number(resident.dueAmount);
  if (dueAmount > 0) return dueAmount;

  return getRoomBaseRent(floors, resident.roomId);
}

/**
 * Returns the amount to display as "amount owed / to collect" for a resident.
 * For unpaid residents: returns all balances due as of today. Paid residents show monthly rent.
 */
export function getResidentDueDisplayAmount(
  resident: Pick<Resident, 'roomId' | 'monthlyRent' | 'dueAmount' | 'paymentStatus'> | null | undefined,
  floors: Floor[]
): number {
  if (!resident) return 0;
  if (resident.paymentStatus !== 'paid' && Number(resident.dueAmount) > 0) return Number(resident.dueAmount);
  return getResidentRentAmount(resident, floors);
}

export function getAllPendingPaymentAmount(residents: Resident[], floors: Floor[]): number {
  return residents.reduce((total, resident) => {
    if (
      isResidentReserved(resident, floors) ||
      !['due', 'late', 'partially_paid'].includes(resident.paymentStatus)
    ) return total;

    return total + Math.max(0, Number(resident.dueAmount) || 0);
  }, 0);
}

export function isValidPartialPaymentAmount(amount: string | number, dueAmount: number): boolean {
  const value = Number(amount);
  return Number.isInteger(value) && value > 0 && value <= dueAmount;
}

export function isSecurityDepositPayment(payment: { title?: string } | null | undefined) {
  return payment?.title === 'Security Deposit';
}

