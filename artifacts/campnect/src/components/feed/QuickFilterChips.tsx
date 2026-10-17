import React from 'react';

export type FeedCategory = 'all' | 'announcements' | 'societies' | 'lost_found' | 'academic' | 'projects';

interface QuickFilterChipsProps {
  currentCategory: FeedCategory;
  onCategoryChange: (category: FeedCategory) => void;
}

export const QuickFilterChips: React.FC<QuickFilterChipsProps> = ({
  currentCategory,
  onCategoryChange,
}) => {
  const categories: { id: FeedCategory; label: string; icon: string }[] = [
    { id: 'all', label: 'All', icon: '🌐' },
    { id: 'announcements', label: 'Official', icon: '📢' },
    { id: 'societies', label: 'Clubs', icon: '🎭' },
    { id: 'projects', label: 'Projects', icon: '🚀' },
    { id: 'academic', label: 'Academics', icon: '📚' },
    { id: 'lost_found', label: 'Lost & Found', icon: '🔍' },
  ];

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onCategoryChange(c.id)}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
            currentCategory === c.id
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-muted/60 text-muted-foreground hover:bg-muted'
          }`}
        >
          <span>{c.icon}</span>
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
};
