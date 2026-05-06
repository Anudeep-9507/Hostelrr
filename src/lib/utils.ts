import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Floor } from "../data/mock";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string) {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${parseInt(parts[2], 10).toString().padStart(2, '0')} ${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
  }
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

