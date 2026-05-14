import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Floor, Resident } from "../data/mock";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Get today's date in IST timezone as YYYY-MM-DD format
export function getTodayIST(): string {
  const now = new Date();
  // IST is UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds from UTC
  const istDate = new Date(now.getTime() + istOffset);
  
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format time in IST timezone
export function formatTimeIST(dateString: string): string {
  const d = new Date(dateString);
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

export function formatDate(dateString: string) {
  if (!dateString) return '';
  
  // Handle YYYY-MM-DD format
  const simpleDateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (simpleDateMatch) {
    const [, year, month, day] = simpleDateMatch;
    return `${day}-${month}-${year}`;
  }
  
  // Handle ISO format or any other date string
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}-${month}-${year}`;
}

export function getNamesFromIds(floors: Floor[], roomId: string | undefined, bedId: string | undefined) {
  let roomName = roomId?.replace('r', '') || '';
  let bedName = bedId?.split('b')[1]?.replace(/^\d+/, '')?.toUpperCase() || '';

  if (!floors || !roomId) return { roomName, bedName };

  for (const floor of floors) {
    for (const room of floor.rooms) {
      if (room.id === roomId) {
        roomName = room.number || roomName;
        if (bedId) {
          const bed = room.beds.find(b => b.id === bedId);
          if (bed) {
            bedName = bed.name?.replace('Bed ', '') || bedName;
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
 * For partially_paid residents: returns dueAmount (the remaining balance).
 * For all others: returns the full monthly rent (via getResidentRentAmount).
 */
export function getResidentDueDisplayAmount(
  resident: Pick<Resident, 'roomId' | 'monthlyRent' | 'dueAmount' | 'paymentStatus'> | null | undefined,
  floors: Floor[]
): number {
  if (!resident) return 0;
  if (resident.paymentStatus === 'partially_paid') {
    return Number(resident.dueAmount) || 0;
  }
  return getResidentRentAmount(resident, floors);
}

export function isSecurityDepositPayment(payment: { title?: string } | null | undefined) {
  return payment?.title === 'Security Deposit';
}

