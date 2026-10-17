import React from 'react';

export const SeatCapacityBar: React.FC<{ filled: number; total: number }> = ({ filled, total }) => {
  const percentage = Math.min(100, Math.round((filled / Math.max(1, total)) * 100));
  const isAlmostFull = percentage >= 85;

  return (
    <div className="space-y-1.5 w-full">
      <div className="flex justify-between text-xs font-medium">
        <span>{filled} registered</span>
        <span className={isAlmostFull ? 'text-amber-500 font-semibold' : 'text-muted-foreground'}>
          {total - filled > 0 ? `${total - filled} seats left` : 'Housefull'}
        </span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            percentage >= 95 ? 'bg-rose-500' : percentage >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
