import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Floor } from "../data/mock";

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

