import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CircleHelp, X, MessageCircle, Phone, Mail, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface ContactSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContactSupportModal: React.FC<ContactSupportModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-7 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#155dfc]/10 text-[#155dfc]">
                  <CircleHelp size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">Contact Support</h3>
                  <p className="text-xs text-slate-500">We are here to help you</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 py-5">
              {/* WhatsApp */}
              <a
                href="https://wa.me/917330744800?text=Hello%20Hostelrr%20Support%2C%20I%20need%20help%20with%20my%20hostel%20account."
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-4 transition hover:bg-emerald-50 hover:border-emerald-300"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                    <MessageCircle size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-emerald-950">Chat on WhatsApp</p>
                    <p className="text-xs text-emerald-700 font-medium">+91 7330744800 · Instant replies</p>
                  </div>
                </div>
                <ExternalLink size={16} className="text-emerald-600 transition group-hover:translate-x-0.5" />
              </a>

              {/* Direct Call */}
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-[#155dfc]/30 hover:bg-[#155dfc]/5">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#155dfc]/10 text-[#155dfc]">
                    <Phone size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-800">Phone Call</p>
                    <a href="tel:+917330744800" className="text-xs font-semibold text-[#155dfc] hover:underline block truncate">
                      +91 7330744800
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText('+91 7330744800');
                    toast.success('Phone number copied to clipboard');
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                >
                  <Copy size={13} /> Copy
                </button>
              </div>

              {/* Email */}
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-[#155dfc]/30 hover:bg-[#155dfc]/5">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <Mail size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-800">Email Support</p>
                    <a href="mailto:hostelrr.support@gmail.com?subject=Hostelrr%20Support%20Request" className="text-xs font-semibold text-[#155dfc] hover:underline block truncate">
                      hostelrr.support@gmail.com
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText('hostelrr.support@gmail.com');
                    toast.success('Support email copied to clipboard');
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                >
                  <Copy size={13} /> Copy
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-center">
              <p className="text-xs font-semibold text-slate-600">
                Support hours: <span className="font-bold text-slate-800">9:00 AM – 9:00 PM IST (Mon – Sat)</span>
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">Average response time under 15 minutes</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ContactSupportModal;
