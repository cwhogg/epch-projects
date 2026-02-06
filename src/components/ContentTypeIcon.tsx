import { ContentType } from '@/types';

const icons: Record<ContentType, { path: string; color: string; label: string }> = {
  'blog-post': {
    path: 'M4 4h16v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4z',
    color: 'var(--color-indigo)',
    label: 'Blog Post',
  },
  comparison: {
    path: 'M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4V3zm6 0h4a2 2 0 012 2v14a2 2 0 01-2 2h-4V3zm-2 0h-2v18h2V3z',
    color: 'var(--accent-amber)',
    label: 'Comparison',
  },
  faq: {
    path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z',
    color: 'var(--color-pink)',
    label: 'FAQ',
  },
};

export default function ContentTypeIcon({ type, size = 16 }: { type: ContentType; size?: number }) {
  const icon = icons[type] || icons['blog-post'];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={icon.color}
      style={{ flexShrink: 0 }}
    >
      <path d={icon.path} />
    </svg>
  );
}

export function ContentTypeBadge({ type }: { type: ContentType }) {
  const icon = icons[type] || icons['blog-post'];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
      style={{
        background: `${icon.color}20`,
        color: icon.color,
      }}
    >
      <ContentTypeIcon type={type} size={12} />
      {icon.label}
    </span>
  );
}
