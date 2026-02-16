import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScoreRing from '../ScoreRing';

describe('ScoreRing', () => {
  it('renders the score value', () => {
    render(<ScoreRing score={8} label="SEO" />);
    expect(screen.getByText('8')).toBeDefined();
  });

  it('renders the label', () => {
    render(<ScoreRing score={8} label="SEO" />);
    expect(screen.getByText('SEO')).toBeDefined();
  });

  it('renders ? when score is null', () => {
    render(<ScoreRing score={null} label="Unknown" />);
    expect(screen.getByText('?')).toBeDefined();
  });

  it('uses green color for score >= 7', () => {
    const { container } = render(<ScoreRing score={8} label="SEO" />);
    const circle = container.querySelectorAll('circle')[1];
    expect(circle?.getAttribute('stroke')).toBe('var(--accent-emerald)');
  });

  it('uses amber color for score 4-6', () => {
    const { container } = render(<ScoreRing score={5} label="WTP" />);
    const circle = container.querySelectorAll('circle')[1];
    expect(circle?.getAttribute('stroke')).toBe('var(--accent-amber)');
  });

  it('uses danger color for score < 4', () => {
    const { container } = render(<ScoreRing score={2} label="Low" />);
    const circle = container.querySelectorAll('circle')[1];
    expect(circle?.getAttribute('stroke')).toBe('var(--color-danger)');
  });

  it('respects custom size prop', () => {
    const { container } = render(<ScoreRing score={8} label="Overall" size={80} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('80');
    expect(svg?.getAttribute('height')).toBe('80');
  });
});
