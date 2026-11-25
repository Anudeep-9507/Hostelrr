import { supabase } from '../supabaseClient';

export async function callAdmin<T = any>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const functionName = action === 'reminder_settings' || action === 'set_reminder_template'
    ? 'reminder-admin'
    : 'admin-api';
  const { data, error } = await supabase.functions.invoke(functionName, { body: { action, params } });
  if (error) {
    let message = error.message || 'Admin service is unavailable';
    const response = (error as { context?: Response }).context;
    if (response && typeof response.clone === 'function') {
      try {
        const body = await response.clone().json();
        if (typeof body?.error === 'string' && body.error.trim()) message = body.error;
      } catch {
        // Keep SDK message when function response isn't JSON.
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
