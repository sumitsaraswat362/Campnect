import React from 'react';

export const NotificationBadge: React.FC<{ unreadCount: number }> = ({ unreadCount }) => {
  if (unreadCount <= 0) return null;

  return (
    <span className="relative flex h-5 min-w-5 items-center justify-center px-1">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60" />
      <span className="relative inline-flex rounded-full h-5 min-w-5 px-1.5 items-center justify-center bg-rose-500 text-[10px] font-bold text-white shadow-sm">
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    </span>
  );
};
