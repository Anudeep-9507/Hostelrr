export const ROUTES = {
  home: '/',
  dashboard: '/dashboard',
  rooms: '/rooms',
  residents: '/residents',
  payments: '/payments',
  settings: '/settings',
  signin: '/signin',
  signup: '/signup',
  onboarding: '/onboarding',
  join: '/join', // used as prefix: /join/:slug
} as const;

// Map internal tab IDs (used in sidebar navItems) to route paths
export const TAB_TO_ROUTE: Record<string, string> = {
  dashboard: ROUTES.dashboard,
  building: ROUTES.rooms,
  residents: ROUTES.residents,
  payments: ROUTES.payments,
  settings: ROUTES.settings,
};

// Map route paths back to tab IDs (for sidebar active state)
export const ROUTE_TO_TAB: Record<string, string> = {
  [ROUTES.dashboard]: 'dashboard',
  [ROUTES.rooms]: 'building',
  [ROUTES.residents]: 'residents',
  [ROUTES.payments]: 'payments',
  [ROUTES.settings]: 'settings',
};
