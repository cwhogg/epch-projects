import type { BrandIdentity } from '@/types';
import type {
  PageSpec,
  HeroCopy,
  ProblemCopy,
  FeaturesCopy,
  HowItWorksCopy,
  AudienceCopy,
  ObjectionsCopy,
  FinalCtaCopy,
  FaqCopy,
} from './painted-door-page-spec';
import { esc, escAttr, navFragment, footerFragment } from './painted-door-templates';

// ---------------------------------------------------------------------------
// Render context — shared across section renderers
// ---------------------------------------------------------------------------

export interface RenderContext {
  brand: BrandIdentity;
  formStateVarNames: {
    email: string;
    status: string;
    handleSubmit: string;
  };
}

// ---------------------------------------------------------------------------
// Section renderers — each returns a JSX string fragment
// ---------------------------------------------------------------------------

export function renderHeroSection(copy: HeroCopy, ctx: RenderContext): string {
  const { handleSubmit, email, status } = ctx.formStateVarNames;
  return `        {/* Hero */}
        <section aria-label="Hero" className="mx-auto max-w-5xl px-6 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-text mb-4 leading-tight">
            ${esc(copy.headline)}
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto mb-8">
            ${esc(copy.subheadline)}
          </p>

          {/* Email Signup */}
          <div className="max-w-md mx-auto">
            {${status} === 'success' ? (
              <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
                <p className="text-primary font-medium">Thanks for signing up! We&apos;ll be in touch.</p>
              </div>
            ) : (
              <form onSubmit={${handleSubmit}} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={${email}}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="flex-1 px-4 py-3 rounded-lg bg-background-elevated border border-border text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={${status} === 'loading'}
                  className="px-6 py-3 bg-primary text-background font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {${status} === 'loading' ? 'Sending...' : \`${esc(copy.ctaText)}\`}
                </button>
              </form>
            )}
            {${status} === 'error' && (
              <p className="text-red-400 text-sm mt-2">{errorMsg}</p>
            )}
          </div>
        </section>`;
}

export function renderProblemSection(copy: ProblemCopy, _ctx: RenderContext): string {
  return `        {/* Problem */}
        <section aria-label="Problem" className="mx-auto max-w-3xl px-6 py-12">
          <h2 className="text-2xl font-bold text-text text-center mb-4">
            ${esc(copy.headline)}
          </h2>
          <p className="text-text-secondary text-center leading-relaxed">
            ${esc(copy.body)}
          </p>
        </section>`;
}

export function renderFeaturesSection(copy: FeaturesCopy, _ctx: RenderContext): string {
  const count = copy.features.length;
  // 3 or 6 → 3 cols, 4 → 2 cols, 5 → 3 cols
  const gridCols = count % 3 === 0 || count === 5 ? 3 : 2;

  const cards = copy.features
    .map(
      (f) => `          <section aria-label="${escAttr(f.title)}" className="bg-background-elevated border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-text mb-2">${esc(f.title)}</h3>
            <p className="text-text-secondary text-sm leading-relaxed">${esc(f.description)}</p>
          </section>`,
    )
    .join('\n');

  return `        {/* Features */}
        <section aria-label="Features" className="mx-auto max-w-5xl px-6 py-12">
          <h2 className="text-2xl font-bold text-text text-center mb-8">${esc(copy.sectionHeadline)}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-${gridCols} gap-6">
${cards}
          </div>
        </section>`;
}

export function renderHowItWorksSection(copy: HowItWorksCopy, _ctx: RenderContext): string {
  const steps = copy.steps
    .map(
      (s, i) => `          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-background flex items-center justify-center font-bold text-sm">${i + 1}</div>
            <div>
              <h3 className="text-lg font-semibold text-text mb-1">${esc(s.label)}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">${esc(s.description)}</p>
            </div>
          </div>`,
    )
    .join('\n');

  return `        {/* How It Works */}
        <section aria-label="How it works" className="mx-auto max-w-3xl px-6 py-12">
          <h2 className="text-2xl font-bold text-text text-center mb-8">${esc(copy.sectionHeadline)}</h2>
          <div className="space-y-6">
${steps}
          </div>
        </section>`;
}

export function renderAudienceSection(copy: AudienceCopy, _ctx: RenderContext): string {
  return `        {/* Audience */}
        <section aria-label="Audience" className="mx-auto max-w-3xl px-6 py-12">
          <h2 className="text-2xl font-bold text-text text-center mb-4">
            ${esc(copy.sectionHeadline)}
          </h2>
          <p className="text-text-secondary text-center leading-relaxed">
            ${esc(copy.body)}
          </p>
        </section>`;
}

export function renderObjectionSection(copy: ObjectionsCopy, _ctx: RenderContext): string {
  const items = copy.objections
    .map(
      (o) => `            <div className="border-b border-border pb-4">
              <h3 className="text-text font-medium mb-2">${esc(o.question)}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">${esc(o.answer)}</p>
            </div>`,
    )
    .join('\n');

  return `        {/* Objections */}
        <section aria-label="Objections" className="mx-auto max-w-3xl px-6 py-12">
          <h2 className="text-2xl font-bold text-text text-center mb-8">${esc(copy.sectionHeadline)}</h2>
          <div className="space-y-4">
${items}
          </div>
        </section>`;
}

export function renderFinalCtaSection(copy: FinalCtaCopy, ctx: RenderContext): string {
  const { handleSubmit, email, status } = ctx.formStateVarNames;
  return `        {/* Final CTA */}
        <section aria-label="Final CTA" className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="text-3xl font-bold text-text mb-4">${esc(copy.headline)}</h2>
          <p className="text-text-secondary mb-8 max-w-xl mx-auto">${esc(copy.body)}</p>
          <div className="max-w-md mx-auto">
            {${status} === 'success' ? (
              <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
                <p className="text-primary font-medium">Thanks for signing up! We&apos;ll be in touch.</p>
              </div>
            ) : (
              <form onSubmit={${handleSubmit}} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={${email}}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="flex-1 px-4 py-3 rounded-lg bg-background-elevated border border-border text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={${status} === 'loading'}
                  className="px-6 py-3 bg-primary text-background font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {${status} === 'loading' ? 'Sending...' : \`${esc(copy.ctaText)}\`}
                </button>
              </form>
            )}
            {${status} === 'error' && (
              <p className="text-red-400 text-sm mt-2">{errorMsg}</p>
            )}
          </div>
        </section>`;
}

export function renderFaqSection(copy: FaqCopy, _ctx: RenderContext): string {
  const items = copy.faqs
    .map(
      (faq) => `            <div className="border-b border-border pb-4">
              <h3 className="text-text font-medium mb-2">${esc(faq.question)}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">${esc(faq.answer)}</p>
            </div>`,
    )
    .join('\n');

  return `        {/* FAQ */}
        <section aria-label="Frequently Asked Questions" className="mx-auto max-w-3xl px-6 py-12">
          <h2 className="text-2xl font-bold text-text text-center mb-8">${esc(copy.sectionHeadline)}</h2>
          <div className="space-y-4">
${items}
          </div>
        </section>`;
}

// ---------------------------------------------------------------------------
// Section dispatch — maps PageSection to renderer
// ---------------------------------------------------------------------------

function renderSection(section: PageSpec['sections'][number], ctx: RenderContext): string {
  switch (section.type) {
    case 'hero': return renderHeroSection(section.copy, ctx);
    case 'problem': return renderProblemSection(section.copy, ctx);
    case 'features': return renderFeaturesSection(section.copy, ctx);
    case 'how-it-works': return renderHowItWorksSection(section.copy, ctx);
    case 'audience': return renderAudienceSection(section.copy, ctx);
    case 'objections': return renderObjectionSection(section.copy, ctx);
    case 'final-cta': return renderFinalCtaSection(section.copy, ctx);
    case 'faq': return renderFaqSection(section.copy, ctx);
  }
}

// ---------------------------------------------------------------------------
// Full page assembly — wrapInPage + renderLandingPage
// ---------------------------------------------------------------------------

function buildJsonLd(brand: BrandIdentity, pageSpec: PageSpec): string {
  const siteUrl = brand.siteUrl || `https://${brand.siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.vercel.app`;

  const orgJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brand.siteName,
    url: siteUrl,
  });

  const webSiteJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: brand.siteName,
    url: siteUrl,
  });

  let jsonLdBlocks = `      <JsonLd data={${orgJsonLd}} />
      <JsonLd data={${webSiteJsonLd}} />`;

  // Add FAQPage JSON-LD if faq section exists
  const faqSection = pageSpec.sections.find((s) => s.type === 'faq');
  if (faqSection && faqSection.type === 'faq') {
    const faqJsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqSection.copy.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    });
    jsonLdBlocks += `\n      <JsonLd data={${faqJsonLd}} />`;
  }

  return jsonLdBlocks;
}

function wrapInPage(
  sectionHtml: string,
  ctx: RenderContext,
  pageSpec: PageSpec,
): string {
  const jsonLdBlocks = buildJsonLd(ctx.brand, pageSpec);

  return `'use client';

import { useState, FormEvent } from 'react';
import JsonLd from '../components/content/JsonLd';

export default function Home() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('success');
        setEmail('');
      } else {
        setStatus('error');
        setErrorMsg(data.error || 'Something went wrong');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Network error — please try again');
    }
  }

  return (
    <>
${jsonLdBlocks}

${navFragment(ctx.brand)}

      <main className="flex-1">
${sectionHtml}
      </main>

${footerFragment(ctx.brand)}
    </>
  );
}
`;
}

export function renderLandingPage(pageSpec: PageSpec, brand: BrandIdentity): string {
  const ctx: RenderContext = {
    brand,
    formStateVarNames: {
      email: 'email',
      status: 'status',
      handleSubmit: 'handleSubmit',
    },
  };

  const sectionHtml = pageSpec.sections
    .map((s) => renderSection(s, ctx))
    .join('\n\n');

  return wrapInPage(sectionHtml, ctx, pageSpec);
}
