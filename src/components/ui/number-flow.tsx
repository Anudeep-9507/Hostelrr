import { useEffect, useRef, useState } from "react";
import NumberFlow, { continuous } from "@number-flow/react";
import type { Value } from "@number-flow/react";

interface CurrencyNumberFlowProps {
  value: Value;
  className?: string;
  trend?: number;
}

export function CurrencyNumberFlow({
  value,
  className,
  trend = 1,
}: CurrencyNumberFlowProps) {
  const [displayValue, setDisplayValue] = useState<Value>(0);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      setDisplayValue(value);
    });

    return () => {
      if (frameRef.current !== undefined) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [value]);

  return (
    <NumberFlow
      value={displayValue}
      prefix="₹"
      locales="en-IN"
      format={{ maximumFractionDigits: 0 }}
      trend={trend}
      animated
      respectMotionPreference={false}
      plugins={[continuous]}
      className={className}
    />
  );
}

