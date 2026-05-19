#!/usr/bin/env node
/**
 * seo-inject.mjs — Inject full SEO head blocks into every Huggy HTML page.
 * Handles UTF-8-BOM files (Windows default).
 * Run: node scripts/seo-inject.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// -------------------------------------------------------------------------- //
//  Shared building blocks                                                     //
// -------------------------------------------------------------------------- //
const ORG_SCHEMA = `    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Organization","name":"Huggy","url":"https://huggy.dev","logo":"https://huggy.dev/og-image.png","description":"Huggy is the AI-native app builder that lets you create production-ready React SaaS apps, dashboards, and websites in seconds.","sameAs":["https://twitter.com/HuggyDev","https://www.linkedin.com/company/huggydev","https://github.com/David-cloud-cyber/Huggy-saas-new"]}
    </script>`;

const WEBSITE_SCHEMA = `    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"WebSite","name":"Huggy","url":"https://huggy.dev","potentialAction":{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https://huggy.dev/?q={search_term_string}"},"query-input":"required name=search_term_string"}}
    </script>`;

const SOFTWARE_SCHEMA = `    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"SoftwareApplication","name":"Huggy AI App Builder","applicationCategory":"DeveloperApplication","operatingSystem":"Web","url":"https://huggy.dev","description":"Build production-ready SaaS apps, dashboards and websites using AI in seconds. Powered by Claude, GPT-5 and Gemini.","featureList":["AI-powered React app generation","One-click deployment","Real-time collaboration","Supabase integration","GitHub sync","Custom domains","Multi-agent AI orchestration"],"offers":{"@type":"AggregateOffer","priceCurrency":"USD","lowPrice":"0","highPrice":"199","offerCount":"6"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.9","reviewCount":"1247","bestRating":"5","worstRating":"1"}}
    </script>`;

const FAQ_SCHEMA = `    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"How does the AI work?","acceptedAnswer":{"@type":"Answer","text":"Huggy uses a powerful orchestration layer that breaks down your requirements into technical specifications, which are then implemented by specialized sub-models for code, design, and infrastructure."}},{"@type":"Question","name":"Can I export my code?","acceptedAnswer":{"@type":"Answer","text":"Yes, you own 100% of the code produced. You can export to GitHub, download a ZIP file, or deploy directly to your own infrastructure at any time."}},{"@type":"Question","name":"Is my data secure?","acceptedAnswer":{"@type":"Answer","text":"All build environments are ephemeral and isolated. We never use your private data or proprietary code to train our base models."}}]}
    </script>`;

const PRICING_SCHEMA = `    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Huggy AI App Builder","brand":{"@type":"Brand","name":"Huggy"},"offers":[{"@type":"Offer","name":"Free","price":"0","priceCurrency":"USD","availability":"https://schema.org/InStock"},{"@type":"Offer","name":"Starter","price":"20","priceCurrency":"USD","availability":"https://schema.org/InStock"},{"@type":"Offer","name":"Pro","price":"49","priceCurrency":"USD","availability":"https://schema.org/InStock"},{"@type":"Offer","name":"Studio","price":"99","priceCurrency":"USD","availability":"https://schema.org/InStock"},{"@type":"Offer","name":"Business","price":"199","priceCurrency":"USD","availability":"https://schema.org/InStock"}]}
    </script>`;

function ogBlock(title, description, url) {
  return `    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website"/>
    <meta property="og:url" content="${url}"/>
    <meta property="og:site_name" content="Huggy"/>
    <meta property="og:title" content="${title}"/>
    <meta property="og:description" content="${description}"/>
    <meta property="og:image" content="https://huggy.dev/og-image.png"/>
    <meta property="og:image:width" content="1200"/>
    <meta property="og:image:height" content="630"/>
    <meta property="og:image:alt" content="Huggy \u2014 AI App Builder"/>
    <meta property="og:locale" content="en_US"/>
    <!-- Twitter / X Card -->
    <meta name="twitter:card" content="summary_large_image"/>
    <meta name="twitter:site" content="@HuggyDev"/>
    <meta name="twitter:title" content="${title}"/>
    <meta name="twitter:description" content="${description}"/>
    <meta name="twitter:image" content="https://huggy.dev/og-image.png"/>`;
}

function buildHead(title, desc, keywords, canonical, extraSchemas = '') {
  return `    <title>${title}</title>
    <!-- Primary SEO -->
    <meta name="description" content="${desc}"/>
    <meta name="keywords" content="${keywords}"/>
    <meta name="author" content="Huggy Inc."/>
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"/>
    <link rel="canonical" href="${canonical}"/>
${ogBlock(title, desc, canonical)}
${ORG_SCHEMA}
${WEBSITE_SCHEMA}
${extraSchemas}`;
}

// -------------------------------------------------------------------------- //
//  Per-page config                                                            //
// -------------------------------------------------------------------------- //
const PAGES = {
  'index.html': {
    title: 'Huggy \u2014 Build any SaaS, App or Dashboard with AI Instantly',
    desc: 'Huggy is the AI-native app builder that creates production-ready React SaaS apps, dashboards, and websites in seconds. Powered by Claude, GPT-5 & Gemini. Free to start \u2014 no credit card required.',
    keywords: 'AI app builder, build SaaS with AI, no-code AI platform, React app generator, AI code generator, Bolt alternative, Lovable alternative, v0 alternative, build dashboard with AI, instant web app builder, AI website generator, vibe coding platform',
    canonical: 'https://huggy.dev/',
    extra: SOFTWARE_SCHEMA + '\n' + FAQ_SCHEMA,
  },
  'pricing.html': {
    title: 'Huggy Pricing \u2014 Free AI App Builder Plans Starting at $0',
    desc: 'Start building AI-powered apps for free. Huggy plans from $0 to $199/mo include AI credits, custom domains, Supabase integration and GitHub sync. No credit card required.',
    keywords: 'AI app builder pricing, no-code SaaS pricing, AI coding tool price, Huggy pricing plans, affordable app builder, free AI developer tool, app builder subscription',
    canonical: 'https://huggy.dev/pricing.html',
    extra: PRICING_SCHEMA,
  },
  'features.html': {
    title: 'Huggy Features \u2014 AI-Native App Builder with Multi-Agent Orchestration',
    desc: 'Explore Huggy\'s powerful features: multi-agent AI orchestration, one-click deployment, real-time collaboration, Supabase integration, GitHub sync, and production-ready React code generation.',
    keywords: 'AI app builder features, multi-agent AI, React code generator, one-click deploy, AI collaboration tool, Supabase integration, app builder features, instant deployment',
    canonical: 'https://huggy.dev/features.html',
    extra: '',
  },
  'about.html': {
    title: 'About Huggy \u2014 The Team Behind the AI-Native App Builder',
    desc: 'Meet the team behind Huggy. Founded by engineers from Stripe, Google, and OpenAI, we\'re on a mission to make software development as intuitive as thought itself.',
    keywords: 'Huggy team, AI startup, app builder company, AI development platform, SaaS builder startup, about Huggy',
    canonical: 'https://huggy.dev/about.html',
    extra: '',
  },
  'enterprise.html': {
    title: 'Huggy Enterprise \u2014 AI App Builder for Teams & Organizations',
    desc: 'Enterprise-grade AI app building with SOC2 compliance, SSO/SAML, dedicated support, isolated execution environments, and custom model controls. Build at scale with Huggy.',
    keywords: 'AI app builder enterprise, enterprise SaaS builder, SOC2 AI platform, AI code generator enterprise, team app builder, SSO SAML AI tool',
    canonical: 'https://huggy.dev/enterprise.html',
    extra: '',
  },
  'documentation.html': {
    title: 'Huggy Documentation \u2014 Get Started with the AI App Builder',
    desc: 'Comprehensive documentation for Huggy. Learn how to build apps with AI, integrate Supabase, deploy to production, and get the most out of every AI model available.',
    keywords: 'Huggy docs, AI app builder documentation, how to build app with AI, Huggy tutorial, AI builder guide, getting started Huggy',
    canonical: 'https://huggy.dev/documentation.html',
    extra: '',
  },
  'blog.html': {
    title: 'Huggy Blog \u2014 AI App Building Insights, Tutorials & News',
    desc: 'Read the latest insights, tutorials, and news from the Huggy team about AI-powered app development, no-code trends, and the future of software creation.',
    keywords: 'AI app builder blog, no-code tutorials, AI development news, build SaaS tutorial, vibe coding blog, AI builder articles',
    canonical: 'https://huggy.dev/blog.html',
    extra: '',
  },
  'showcase.html': {
    title: 'Huggy Showcase \u2014 Apps Built with AI in Seconds',
    desc: 'Discover stunning apps, dashboards, and SaaS products built using Huggy\'s AI app builder. See what\'s possible in seconds with the power of multi-model AI.',
    keywords: 'AI app examples, apps built with AI, no-code showcase, AI SaaS examples, app builder gallery, AI generated apps',
    canonical: 'https://huggy.dev/showcase.html',
    extra: '',
  },
  'security.html': {
    title: 'Huggy Security \u2014 SOC2, GDPR & Enterprise-Grade Protection',
    desc: 'Huggy is built with security first: 256-bit AES encryption, ephemeral isolated builds, SOC2 Type II compliance, GDPR-ready, and zero data retention for your proprietary code.',
    keywords: 'AI app builder security, SOC2 compliance, GDPR AI tool, secure code generation, enterprise security AI, encrypted builds',
    canonical: 'https://huggy.dev/security.html',
    extra: '',
  },
  'privacy.html': {
    title: 'Huggy Privacy Policy \u2014 Your Data, Your Code, Always',
    desc: 'Read the Huggy privacy policy. Your code is never used to train AI models. Data is encrypted, isolated, and handled with the highest standards of user privacy.',
    keywords: 'Huggy privacy policy, AI tool data privacy, code privacy, no training on user data, Huggy GDPR',
    canonical: 'https://huggy.dev/privacy.html',
    extra: '',
  },
  'careers.html': {
    title: 'Careers at Huggy \u2014 Join the AI-Native Dev Tools Team',
    desc: 'Work on the future of software development. Join Huggy and help build the most advanced AI app builder. Open roles in engineering, design, and growth.',
    keywords: 'Huggy careers, AI startup jobs, dev tools company jobs, AI engineer jobs, software jobs 2026',
    canonical: 'https://huggy.dev/careers.html',
    extra: '',
  },
  'community.html': {
    title: 'Huggy Community \u2014 Connect with AI App Builders Worldwide',
    desc: 'Join the Huggy community. Share your apps, get feedback, find collaborators, and level up your AI app building skills alongside thousands of developers worldwide.',
    keywords: 'AI builder community, no-code community, Huggy community, app builder forum, AI developers network',
    canonical: 'https://huggy.dev/community.html',
    extra: '',
  },
  'api-reference.html': {
    title: 'Huggy API Reference \u2014 Build Integrations with the AI Builder API',
    desc: 'Complete API reference for Huggy. Programmatically trigger builds, manage projects, deploy apps, and integrate AI generation capabilities into your own workflows.',
    keywords: 'Huggy API, AI builder API, code generation API, app builder integration, REST API AI, developer API',
    canonical: 'https://huggy.dev/api-reference.html',
    extra: '',
  },
};

// -------------------------------------------------------------------------- //
//  Helpers                                                                    //
// -------------------------------------------------------------------------- //
function readFile(filepath) {
  const raw = readFileSync(filepath);
  const hasBom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  const text = hasBom ? raw.slice(3).toString('utf8') : raw.toString('utf8');
  return { text, hasBom };
}

function writeFile(filepath, text, hasBom) {
  const buf = Buffer.from(text, 'utf8');
  if (hasBom) {
    writeFileSync(filepath, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), buf]));
  } else {
    writeFileSync(filepath, buf);
  }
}

function injectSeo(filepath, cfg) {
  const { text: original, hasBom } = readFile(filepath);

  // Strip any pre-existing lone SEO tags (canonical, robots, keywords, author)
  let text = original
    .replace(/[ \t]*<meta name="description"[^>]*\/>/g, '')
    .replace(/[ \t]*<meta name="keywords"[^>]*\/>/g, '')
    .replace(/[ \t]*<meta name="author"[^>]*\/>/g, '')
    .replace(/[ \t]*<meta name="robots"[^>]*\/>/g, '')
    .replace(/[ \t]*<link rel="canonical"[^>]*\/>/g, '');

  // Replace <title>…</title> with our full head block
  const headBlock = buildHead(cfg.title, cfg.desc, cfg.keywords, cfg.canonical, cfg.extra);
  text = text.replace(/<title>[^<]*<\/title>/, headBlock);

  writeFile(filepath, text, hasBom);
  console.log(`  \u2713 ${filepath.split(/[\\/]/).pop()}`);
}

// -------------------------------------------------------------------------- //
//  Main                                                                       //
// -------------------------------------------------------------------------- //
console.log('Injecting SEO metadata into all HTML pages...\n');
let ok = 0, skip = 0;
for (const [filename, cfg] of Object.entries(PAGES)) {
  const filepath = join(ROOT, filename);
  if (existsSync(filepath)) {
    injectSeo(filepath, cfg);
    ok++;
  } else {
    console.log(`  ! SKIP (not found): ${filename}`);
    skip++;
  }
}
console.log(`\nDone: ${ok} pages updated, ${skip} skipped.`);
