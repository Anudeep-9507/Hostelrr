import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Banknote, Smartphone, X } from 'lucide-react';
import { Resident, Floor } from '../data/mock';
import { cn, getResidentDueDisplayAmount } from '../lib/utils';

interface MarkRentPaidModalProps {
  resident: Resident | null;
  isOpen: boolean;
  onClose: () => void;
  paidUsing: 'UPI' | 'Cash';
  onPaymentMethodChange: (method: 'UPI' | 'Cash') => void;
  isPartialPayment: boolean;
  onPartialPaymentChange: (value: boolean) => void;
  partialAmount: string;
  onPartialAmountChange: (amount: string) => void;
  paymentDate: string;
  onPaymentDateChange: (date: string) => void;
  floors: Floor[];
  onConfirm: () => void;
  isLoading?: boolean;
}

export function MarkRentPaidModal({
  resident,
  isOpen,
  onClose,
  paidUsing,
  onPaymentMethodChange,
  isPartialPayment,
  onPartialPaymentChange,
  partialAmount,
  onPartialAmountChange,
  paymentDate,
  onPaymentDateChange,
  floors,
  onConfirm,
  isLoading
}: MarkRentPaidModalProps) {
  if (!resident) return null;

  const dueAmount = getResidentDueDisplayAmount(resident, floors);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-gray-900/40 backdrop-blur-sm"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-hidden flex flex-col relative z-10"
          >
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 rounded-full transition-colors z-50"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="p-5 sm:p-6 pb-0 overflow-y-auto">
              <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Mark as Paid?</h3>
              <p className="text-gray-500 text-[15px] leading-relaxed mb-6">
                Update payment status for <strong>{resident.name}</strong> for the current cycle.
              </p>

              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-6 flex flex-col items-center justify-center">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Amount to Collect</span>
                <span className="text-3xl font-black text-blue-700">₹{dueAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-gray-900 block mb-4">Paid Using</label>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <button
                      onClick={() => onPaymentMethodChange('UPI')}
                      className={cn(
                        "flex-1 flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all",
                        paidUsing === 'UPI' 
                          ? "border-green-600 bg-green-50 text-green-700 shadow-sm" 
                          : "border-gray-100 bg-gray-50/50 text-gray-500 hover:border-gray-200 hover:bg-gray-100"
                      )}
                    >
                      <Smartphone className={cn("w-6 h-6", paidUsing === 'UPI' ? "text-green-600" : "text-gray-400")} />
                      <span className="font-bold text-sm">UPI</span>
                    </button>
                    <button
                      onClick={() => onPaymentMethodChange('Cash')}
                      className={cn(
                        "flex-1 flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all",
                        paidUsing === 'Cash' 
                          ? "border-green-600 bg-green-50 text-green-700 shadow-sm" 
                          : "border-gray-100 bg-gray-50/50 text-gray-500 hover:border-gray-200 hover:bg-gray-100"
                      )}
                    >
                      <Banknote className={cn("w-6 h-6", paidUsing === 'Cash' ? "text-green-600" : "text-gray-400")} />
                      <span className="font-bold text-sm">Cash</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6 pt-1">
                  <label className="text-sm font-medium text-gray-900">Partial Payment</label>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="partialPayment"
                        checked={isPartialPayment === true}
                        onChange={() => onPartialPaymentChange(true)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Yes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="partialPayment"
                        checked={isPartialPayment === false}
                        onChange={() => onPartialPaymentChange(false)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">No</span>
                    </label>
                  </div>
                </div>

                <AnimatePresence>
                  {isPartialPayment && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="space-y-4 overflow-hidden"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex-1 space-y-2">
                          <label className="text-sm font-medium text-gray-900 block">Pay Amount</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₹</span>
                            <input 
                              type="number" 
                              value={partialAmount}
                              onChange={(e) => onPartialAmountChange(e.target.value)}
                              placeholder="Enter amount"
                              className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-900"
                            />
                          </div>
                        </div>
                        <div className="flex-1 space-y-2">
                          <label className="text-sm font-medium text-gray-900 block">Date</label>
                          <input 
                            type="date" 
                            value={paymentDate}
                            onChange={(e) => onPaymentDateChange(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-900"
                          />
                        </div>
                      </div>
                      
                      <div className={cn(
                        "p-3 rounded-xl border flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between",
                        Number(partialAmount) > dueAmount
                          ? "bg-red-50 border-red-100"
                          : "bg-blue-50 border-blue-100"
                      )}>
                        <span className={cn(
                          "text-sm font-medium",
                          Number(partialAmount) > dueAmount ? "text-red-800" : "text-blue-800"
                        )}>
                          {Number(partialAmount) > dueAmount ? "Status:" : "Remaining Amount:"}
                        </span>
                        <span className={cn(
                          "text-sm font-bold",
                          Number(partialAmount) > dueAmount ? "text-red-900" : "text-blue-900"
                        )}>
                          {Number(partialAmount) > dueAmount
                            ? `Overpaid by ₹${(Number(partialAmount) - dueAmount).toLocaleString('en-IN')}`
                            : `₹${(dueAmount - Number(partialAmount)).toLocaleString('en-IN')}`
                          }
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </div>

            <div className="p-4 sm:p-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 mt-4 border-t border-gray-100 bg-gray-50 shrink-0">
              <button 
                onClick={onClose}
                className="w-full sm:w-auto min-h-11 px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={onConfirm}
                disabled={isLoading}
                className="w-full sm:w-auto min-h-11 justify-center px-6 py-2.5 text-[15px] font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isLoading ? 'Confirming...' : 'Confirm Paid'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
