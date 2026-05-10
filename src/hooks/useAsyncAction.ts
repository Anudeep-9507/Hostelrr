import { useState, useCallback, useRef } from 'react';

/**
 * Hook to wrap any async function with loading state + double-click prevention.
 *
 * Usage:
 *   const { execute, isLoading } = useAsyncAction(myAsyncFn);
 *   <button onClick={() => execute(arg1)} disabled={isLoading}>
 *
 * - Prevents duplicate submissions (ignores calls while pending)
 * - Returns { execute, isLoading }
 * - Does NOT handle errors — caller should use try/catch or toast inside the wrapped fn
 */
export default function useAsyncAction<T extends (...args: any[]) => Promise<any>>(fn: T) {
  const [isLoading, setIsLoading] = useState(false);
  const pendingRef = useRef(false);

  const execute = useCallback(
    async (...args: Parameters<T>): Promise<ReturnType<T> | undefined> => {
      if (pendingRef.current) return undefined;
      pendingRef.current = true;
      setIsLoading(true);
      try {
        const result = await fn(...args);
        return result;
      } finally {
        pendingRef.current = false;
        setIsLoading(false);
      }
    },
    [fn]
  );

  return { execute, isLoading };
}
