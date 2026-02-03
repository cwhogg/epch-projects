import Link from 'next/link';

interface PipelineCardProps {
  stage: string;
  href: string;
  icon: React.ReactNode;
  count: number;
  description: string;
  isPlaceholder?: boolean;
  accentColor: string;
}

export default function PipelineCard({
  stage,
  href,
  icon,
  count,
  description,
  isPlaceholder,
  accentColor,
}: PipelineCardProps) {
  const content = (
    <div
      className={isPlaceholder ? 'card-static p-5 sm:p-6 relative' : 'card p-5 sm:p-6 relative'}
      style={isPlaceholder ? { borderStyle: 'dashed', opacity: 0.5 } : undefined}
    >
      {/* Icon circle */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
        style={{ background: `${accentColor}18`, color: accentColor }}
      >
        {icon}
      </div>

      {/* Count */}
      <div
        className="text-3xl font-display font-semibold mb-1"
        style={{ color: 'var(--text-primary)' }}
      >
        {count}
      </div>

      {/* Stage name */}
      <h3
        className="font-display text-sm font-medium mb-1"
        style={{ color: 'var(--text-primary)' }}
      >
        {stage}
      </h3>

      {/* Description */}
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {description}
      </p>

      {/* Coming Soon badge */}
      {isPlaceholder && (
        <span
          className="absolute top-3 right-3 text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: `${accentColor}18`, color: accentColor }}
        >
          Coming Soon
        </span>
      )}
    </div>
  );

  if (isPlaceholder) {
    return content;
  }

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}

// Arrow connector between pipeline cards
export function PipelineArrow({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className || ''}`}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-muted)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.4 }}
      >
        <path d="M5 12h14" />
        <path d="M12 5l7 7-7 7" />
      </svg>
    </div>
  );
}

export function PipelineArrowDown({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-1 ${className || ''}`}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-muted)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.4 }}
      >
        <path d="M12 5v14" />
        <path d="M19 12l-7 7-7-7" />
      </svg>
    </div>
  );
}
