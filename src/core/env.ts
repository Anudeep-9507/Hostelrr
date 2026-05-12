const parseFlag = (value: string | undefined, defaultValue = false): boolean => {
  if (typeof value !== 'string') return defaultValue;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

export const FLAGS = {
  demoMode: parseFlag(import.meta.env.VITE_DEMO_MODE, false), // Production-safe default
  monthlyOverview: parseFlag(import.meta.env.VITE_ENABLE_MONTHLY_OVERVIEW, true),
  whatsappAutomation: parseFlag(import.meta.env.VITE_ENABLE_WHATSAPP_AUTOMATION, true),
  autoReminders: parseFlag(import.meta.env.VITE_ENABLE_AUTO_REMINDERS, true),
  deposits: parseFlag(import.meta.env.VITE_ENABLE_DEPOSITS, true),
  maintenanceMode: parseFlag(import.meta.env.VITE_MAINTENANCE_MODE, false),
};

export const isDemoMode = FLAGS.demoMode;
export const isMaintenanceMode = FLAGS.maintenanceMode;
