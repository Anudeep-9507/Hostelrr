import React from 'react';

interface SubscriptionGuardProps {
  /** Feature key for future gating (e.g., "advanced_analytics", "bulk_export") */
  feature: string;
  children: React.ReactNode;
  /** Optional fallback UI when feature is gated (future use) */
  fallback?: React.ReactNode;
}

/**
 * Lightweight subscription/feature-gate wrapper.
 *
 * Current behavior: always renders children (no paywall).
 * Future: check subscription status and conditionally show upgrade modal.
 *
 * Usage:
 *   <SubscriptionGuard feature="advanced_analytics">
 *     <AnalyticsPage />
 *   </SubscriptionGuard>
 */
export default function SubscriptionGuard({ feature: _feature, children, fallback: _fallback }: SubscriptionGuardProps) {
  // Future implementation:
  // const { subscription } = useSubscription();
  // const hasAccess = subscription.plan === 'pro' || subscription.features.includes(feature);
  // if (!hasAccess) return fallback ?? <UpgradePrompt feature={feature} />;

  return <>{children}</>;
}
