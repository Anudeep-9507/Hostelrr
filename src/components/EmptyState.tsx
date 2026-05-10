import { type LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Reusable empty state component with icon, title, subtitle, and optional CTA.
 * Matches Hostelrr design language: rounded-2xl, dashed border, muted colors.
 */
export default function EmptyState({ icon: Icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="p-12 text-center bg-white rounded-2xl border border-gray-200 border-dashed">
      <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-100">
        <Icon className="w-7 h-7 text-gray-400" />
      </div>
      <h3 className="text-base font-bold text-gray-800 mb-1">{title}</h3>
      {subtitle && (
        <p className="text-sm text-gray-500 max-w-xs mx-auto">{subtitle}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 inline-flex items-center gap-2 bg-[#1D4ED8] hover:bg-[#1e40af] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm hover:shadow-md"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
