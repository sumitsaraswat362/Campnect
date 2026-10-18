import React from 'react';

interface Achievement {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  date: string;
}

export const StudentAchievements: React.FC<{ achievements?: Achievement[] }> = ({
  achievements = [
    { id: '1', icon: '🏆', title: 'Hackathon Finalist', subtitle: 'National Campus Hack 2026', date: 'Oct 2026' },
    { id: '2', icon: '⭐', title: 'Society Lead Contributor', subtitle: 'Web & Open Source Club', date: 'Sep 2026' },
    { id: '3', icon: '💡', title: 'Top Campus Innovator', subtitle: 'Project Showcase Award', date: 'Aug 2026' },
  ],
}) => {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campus Badges & Honours</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {achievements.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-xl border bg-card/60">
            <span className="text-2xl p-2 rounded-lg bg-primary/10">{a.icon}</span>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate text-foreground">{a.title}</div>
              <div className="text-[11px] text-muted-foreground truncate">{a.subtitle}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
