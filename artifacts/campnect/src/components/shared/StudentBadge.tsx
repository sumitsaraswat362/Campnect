import React from 'react';

export interface StudentBadgeProps {
  type: 'verified_student' | 'club_lead' | 'society_rep' | 'alumni' | 'mentor';
  collegeName?: string;
}

export const StudentBadge: React.FC<StudentBadgeProps> = ({ type, collegeName }) => {
  const badgeMap = {
    verified_student: { label: 'Verified Student', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20' },
    club_lead: { label: 'Club Lead', color: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/20' },
    society_rep: { label: 'Society Rep', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20' },
    alumni: { label: 'Alumni', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20' },
    mentor: { label: 'Campus Mentor', color: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20' },
  };

  const badge = badgeMap[type] || badgeMap.verified_student;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.color}`}
      title={collegeName ? `${badge.label} • ${collegeName}` : badge.label}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {badge.label}
    </span>
  );
};
