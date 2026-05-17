import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Banknote, Smartphone } from 'lucide-react';
import { Resident } from '../data/mock';

interface MarkDepositPaidModalProps {
  resident: Resident | null;
  isOpen: boolean;
  onClose: () => void;
  depositPaymentDate: string;
  onPaymentDateChange: (date: string) => void;
  depositPaymentMethod: 'UPI' | 'Cash';
  onPaymentMethodChange: (method: 'UPI' | 'Cash') => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function MarkDepositPaidModal({
  resident,
  isOpen,
  onClose,
  depositPaymentDate,
  onPaymentDateChange,
  depositPaymentMethod,
  onPaymentMethodChange,
  onConfirm,
  isLoading
}: MarkDepositPaidModalProps) {
  if (!resident) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-gray-900/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto relative z-10"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 sm:p-6">
              <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Mark Deposit as Paid?</h3>
              <p className="text-gray-500 text-[15px] leading-relaxed mb-6">
                Update security deposit status for <strong>{resident.name}</strong>.
              </p>

              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-6 flex flex-col items-center justify-center">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Deposit Amount</span>
                <span className="text-3xl font-black text-blue-700">₹{resident.securityDeposit?.toLocaleString('en-IN')}</span>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-gray-900 block mb-4">Paid Using</label>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <button 
                      onClick={() => onPaymentMethodChange('UPI')}
                      className={`flex-1 py-3 px-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                        depositPaymentMethod === 'UPI' 
                          ? 'border-blue-600 bg-blue-50 text-blue-700' 
                          : 'border-gray-100 hover:border-gray-200 text-gray-600'
                      }`}
                    >
                      <Smartphone className="w-6 h-6" />
                      <span className="text-sm font-semibold">UPI</span>
                    </button>
                    <button 
                      onClick={() => onPaymentMethodChange('Cash')}
                      className={`flex-1 py-3 px-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                        depositPaymentMethod === 'Cash' 
                          ? 'border-blue-600 bg-blue-50 text-blue-700' 
                          : 'border-gray-100 hover:border-gray-200 text-gray-600'
                      }`}
                    >
                      <Banknote className="w-6 h-6" />
                      <span className="text-sm font-semibold">Cash</span>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-900 block mb-2">Payment Date</label>
                  <input 
                    type="date" 
                    value={depositPaymentDate}
                    onChange={(e) => onPaymentDateChange(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium text-gray-900"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 border-t border-gray-100">
              <button 
                onClick={onClose}
                className="w-full sm:w-auto min-h-11 px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={onConfirm}
                disabled={isLoading}
                className="w-full sm:w-auto min-h-11 justify-center px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
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
