import React, { useState } from 'react';

interface SkillItem {
  id: string;
  name: string;
  endorsements: number;
  userEndorsed?: boolean;
}

export const SkillEndorsements: React.FC<{ initialSkills?: SkillItem[] }> = ({
  initialSkills = [
    { id: '1', name: 'React 19', endorsements: 18 },
    { id: '2', name: 'TypeScript', endorsements: 24 },
    { id: '3', name: 'Capacitor Android', endorsements: 14 },
    { id: '4', name: 'UI/UX Design', endorsements: 9 },
    { id: '5', name: 'Machine Learning', endorsements: 11 },
  ],
}) => {
  const [skills, setSkills] = useState(initialSkills);

  const endorse = (id: string) => {
    setSkills((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, endorsements: s.userEndorsed ? s.endorsements - 1 : s.endorsements + 1, userEndorsed: !s.userEndorsed }
          : s
      )
    );
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skills & Endorsements</h3>
      <div className="flex flex-wrap gap-2">
        {skills.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => endorse(s.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
              s.userEndorsed
                ? 'bg-blue-500/15 text-blue-600 border-blue-500/40 dark:text-blue-300'
                : 'bg-card hover:bg-muted text-card-foreground border-border'
            }`}
          >
            <span>{s.name}</span>
            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums">
              {s.endorsements}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
