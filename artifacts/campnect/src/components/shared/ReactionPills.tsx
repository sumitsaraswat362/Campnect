import React, { useState } from 'react';

interface Reaction {
  emoji: string;
  count: number;
  userReacted?: boolean;
}

interface ReactionPillsProps {
  initialReactions?: Reaction[];
  onReact?: (emoji: string) => void;
}

export const ReactionPills: React.FC<ReactionPillsProps> = ({
  initialReactions = [
    { emoji: '🔥', count: 12 },
    { emoji: '❤️', count: 8 },
    { emoji: '💡', count: 5 },
    { emoji: '🎉', count: 3 },
  ],
  onReact,
}) => {
  const [reactions, setReactions] = useState(initialReactions);

  const toggle = (emoji: string) => {
    setReactions((prev) =>
      prev.map((r) =>
        r.emoji === emoji
          ? { ...r, count: r.userReacted ? r.count - 1 : r.count + 1, userReacted: !r.userReacted }
          : r
      )
    );
    onReact?.(emoji);
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center py-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => toggle(r.emoji)}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            r.userReacted
              ? 'bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400'
              : 'bg-muted/50 hover:bg-muted text-muted-foreground border-border'
          }`}
        >
          <span>{r.emoji}</span>
          <span className="tabular-nums">{r.count}</span>
        </button>
      ))}
    </div>
  );
};
