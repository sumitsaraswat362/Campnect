import React, { useState, useEffect } from 'react';

export const EventCountdown: React.FC<{ targetDate: string }> = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState<{ d: number; h: number; m: number; s: number }>({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, new Date(targetDate).getTime() - Date.now());
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);
      setTimeLeft({ d, h, m, s });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <div className="flex gap-2 text-center">
      {[
        { label: 'Days', val: timeLeft.d },
        { label: 'Hours', val: timeLeft.h },
        { label: 'Min', val: timeLeft.m },
        { label: 'Sec', val: timeLeft.s },
      ].map((item) => (
        <div key={item.label} className="bg-card border rounded-lg px-2 py-1 min-w-[48px]">
          <div className="text-sm font-bold tabular-nums">{item.val}</div>
          <div className="text-[10px] text-muted-foreground uppercase">{item.label}</div>
        </div>
      ))}
    </div>
  );
};
