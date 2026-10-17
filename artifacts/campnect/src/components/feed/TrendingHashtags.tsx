import React from 'react';

interface TrendingHashtagsProps {
  tags?: string[];
  selectedTag?: string | null;
  onSelectTag?: (tag: string) => void;
}

export const TrendingHashtags: React.FC<TrendingHashtagsProps> = ({
  tags = ['Campnect2026', 'HackathonSprint', 'TechFest', 'CulturalNight', 'Placements', 'HostelLife'],
  selectedTag,
  onSelectTag,
}) => {
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-2 no-scrollbar">
      <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap pl-1">Trending:</span>
      {tags.map((tag) => {
        const isSelected = selectedTag === tag;
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onSelectTag?.(tag)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap transition-all border ${
              isSelected
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:border-primary/50'
            }`}
          >
            #{tag}
          </button>
        );
      })}
    </div>
  );
};
