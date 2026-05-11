import { LucideIcon, LayoutDashboard, BedDouble, Users, IndianRupee, Settings } from 'lucide-react';

// Route metadata with path + label
export interface RouteConfig {
  path: string;
  label: string;
  icon?: LucideIcon;
}

export const ROUTES = {
  home: { path: '/', label: 'Home' },
  dashboard: { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  rooms: { path: '/rooms', label: 'Rooms & Beds', icon: BedDouble },
  residents: { path: '/residents', label: 'Residents', icon: Users },
  payments: { path: '/payments', label: 'Payments', icon: IndianRupee },
  settings: { path: '/settings', label: 'Settings', icon: Settings },
  monthlyOverview: { path: '/monthly-overview', label: 'Monthly Overview' },
  signin: { path: '/signin', label: 'Sign In' },
  signup: { path: '/signup', label: 'Sign Up' },
  onboarding: { path: '/onboarding', label: 'Onboarding' },
  join: { path: '/join', label: 'Join' }, // used as prefix: /join/:slug
} as const;
// Route keys that have icons (for sidebar use)
export type SidebarRouteKey = 'dashboard' | 'rooms' | 'residents' | 'payments' | 'settings';

// Sidebar navigation items in display order
export const SIDEBAR_NAV_ITEMS: { routeKey: SidebarRouteKey; tabId: string }[] = [
  { routeKey: 'dashboard', tabId: 'dashboard' },
  { routeKey: 'rooms', tabId: 'building' },
  { routeKey: 'residents', tabId: 'residents' },
  { routeKey: 'payments', tabId: 'payments' },
  { routeKey: 'settings', tabId: 'settings' },
];

// Map internal tab IDs (used in sidebar) to route paths
export const TAB_TO_ROUTE: Record<string, string> = {
  dashboard: ROUTES.dashboard.path,
  building: ROUTES.rooms.path,
  residents: ROUTES.residents.path,
  payments: ROUTES.payments.path,
  settings: ROUTES.settings.path,
};

// Map route paths back to tab IDs (for sidebar active state)
export const ROUTE_TO_TAB: Record<string, string> = {
  [ROUTES.dashboard.path]: 'dashboard',
  [ROUTES.rooms.path]: 'building',
  [ROUTES.residents.path]: 'residents',
  [ROUTES.payments.path]: 'payments',
  [ROUTES.settings.path]: 'settings',
};
