import React from 'react';
import { Resident } from '../data/mock';
import { IndianRupee, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

export const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.487-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

interface ResidentStatusCardProps {
  resident: Resident;
  dueAmount: number;
  onSendReminder: () => void;
  onMarkPaid: () => void;
  onSendDepositReminder: () => void;
  onMarkDepositPaid: () => void;
  isSendingReminder?: boolean;
  isCompact?: boolean;
}

export default function ResidentStatusCard({
  resident,
  dueAmount,
  onSendReminder,
  onMarkPaid,
  onSendDepositReminder,
  onMarkDepositPaid,
  isSendingReminder = false,
  isCompact = false,
}: ResidentStatusCardProps) {
  if (resident.status === 'reserved') return null;

  return (
    <div className={isCompact ? 'space-y-2' : 'space-y-3'}>
      {isCompact && (
        <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Status</h4>
      )}

      {/* Dues Card */}
      {resident.paymentStatus !== 'paid' && (
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-sm text-gray-700">Dues</span>
          </div>
          <div className="flex w-full flex-col gap-3 sm:max-w-[320px] sm:items-end">
            <span className="text-sm font-bold text-red-600 self-start sm:self-auto">₹{dueAmount.toLocaleString('en-IN')}</span>
            <div className="grid w-full grid-cols-2 gap-2">
              <button
                onClick={onSendReminder}
                disabled={isSendingReminder}
                className="h-11 min-w-0 w-full justify-center whitespace-nowrap bg-[#25D366] hover:bg-[#22c35e] disabled:opacity-60 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              >
                <WhatsAppIcon className="w-3.5 h-3.5" /> Remind
              </button>
              <button
                onClick={onMarkPaid}
                className="h-11 min-w-0 w-full justify-center whitespace-nowrap text-[#059669] bg-white border border-[#A7F3D0]/70 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-[#ECFDF5] transition-all flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark Paid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security Deposit Card */}
      {resident.securityDeposit && !resident.isDepositPaid && (
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-sm text-gray-700">Security Deposit</span>
          </div>
          <div className="flex w-full flex-col gap-3 sm:max-w-[320px] sm:items-end">
            <span className="text-sm font-bold text-red-600 self-start sm:self-auto">₹{resident.securityDeposit.toLocaleString('en-IN')}</span>
            <div className="grid w-full grid-cols-2 gap-2">
              <button
                onClick={onSendDepositReminder}
                disabled={isSendingReminder}
                className="h-11 min-w-0 w-full justify-center whitespace-nowrap bg-[#25D366] hover:bg-[#22c35e] disabled:opacity-60 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              >
                <WhatsAppIcon className="w-3.5 h-3.5" /> Remind
              </button>
              <button
                onClick={onMarkDepositPaid}
                className="h-11 min-w-0 w-full justify-center whitespace-nowrap text-[#059669] bg-white border border-[#A7F3D0]/70 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-[#ECFDF5] transition-all flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark Paid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
