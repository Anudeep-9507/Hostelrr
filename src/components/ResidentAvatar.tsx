import React from 'react';
import { Resident } from '../data/mock';
import { isResidentReserved } from '../lib/utils';
import { Floor } from '../data/mock';
import DefaultAvatar from './DefaultAvatar';
import { PrivatePhoto } from './PrivatePhoto';

type ResidentAvatarProps = {
  resident: Resident;
  floors: Floor[];
  className?: string;
  dotClassName?: string;
};

export function getResidentStatusDotColor(resident: Resident, floors: Floor[]) {
  if (isResidentReserved(resident, floors) || resident.status === 'reserved') return 'bg-blue-500';
  if (resident.paymentStatus === 'paid') return 'bg-emerald-500';
  if (resident.paymentStatus === 'late') return 'bg-red-500';
  if (resident.paymentStatus === 'partially_paid') return 'bg-purple-500';
  return 'bg-orange-500';
}

export default function ResidentAvatar({
  resident,
  floors,
  className = 'h-12 w-12',
  dotClassName = 'h-3 w-3',
}: ResidentAvatarProps) {
  return (
    <div className={`relative shrink-0 ${className}`}>
      <div className="h-full w-full overflow-hidden rounded-[14px] border-2 border-white bg-slate-100 ring-1 ring-slate-200 shadow-sm">
        {resident.photoPath || resident.photoUrl ? (
          <PrivatePhoto
            kind="resident"
            id={resident.id}
            photoPath={resident.photoPath}
            fallbackSrc={resident.photoUrl}
            alt={resident.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <DefaultAvatar className="h-full w-full" />
        )}
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white shadow-sm ${dotClassName} ${getResidentStatusDotColor(resident, floors)}`}
        aria-label="Payment status"
        title="Payment status"
      />
    </div>
  );
}
