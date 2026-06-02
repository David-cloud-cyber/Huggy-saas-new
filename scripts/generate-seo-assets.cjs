const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const siteUrl = 'https://huggy.fun';
const now = new Date().toISOString().slice(0, 10);

const existingPages = [
  { file: 'index.html', path: '/', title: 'Huggy — AI App Builder for Production-Ready Web Apps', description: 'Generate premium web apps with real database, responsive preview, deployment, analytics and SEO-ready output.' },
  { file: 'pricing.html', path: '/pricing.html', title: 'Huggy Pricing — Build, Preview and Deploy AI Apps', description: 'Choose the Huggy plan for AI app generation, premium models, custom domains, export and deployment workflows.' },
  { file: 'features.html', path: '/features.html', title: 'Huggy Features — Plan, Build, Database, Preview and Deploy', description: 'Explore Huggy features for AI-native app building: Plan/Build chat, Supabase-ready database, responsive preview, analytics and deployment.' },
  { file: 'documentation.html', path: '/documentation.html', title: 'Huggy Documentation — Build Production Apps With AI', description: 'Learn how to use Huggy to plan, generate, preview, fix, export and deploy AI-built web apps.' },
  { file: 'enterprise.html', path: '/enterprise.html', title: 'Huggy Enterprise — AI App Builder for Product Teams', description: 'Huggy Enterprise gives product teams governed AI app generation with billing, collaboration, domains and production workflows.' },
  { file: 'security.html', path: '/security.html', title: 'Huggy Security — Safer AI App Generation', description: 'Security practices for Huggy projects, generated apps, secrets, billing and deployment workflows.' },
  { file: 'privacy.html', path: '/privacy.html', title: 'Huggy Privacy — Data and Project Privacy', description: 'How Huggy handles prompts, project files, assets, analytics and workspace data.' },
  { file: 'about.html', path: '/about.html', title: 'About Huggy — Production-Ready AI App Builder', description: 'Huggy helps founders, product teams and agencies generate polished apps that can be previewed, connected to data and deployed.' },
  { file: 'showcase.html', path: '/showcase.html', title: 'Huggy Showcase — Apps Built With Huggy', description: 'Explore apps, templates and product ideas generated with Huggy.' },
  { file: 'blog.html', path: '/blog.html', title: 'Huggy Blog — AI App Builder Guides', description: 'Guides, prompts and product lessons for building production-ready apps with AI.' },
  { file: 'community.html', path: '/community.html', title: 'Huggy Community — AI Builders and Product Teams', description: 'Join builders using Huggy to create apps, landing pages, dashboards and internal tools with AI.' },
  { file: 'careers.html', path: '/careers.html', title: 'Huggy Careers — Build the Future of AI App Creation', description: 'Work on Huggy, an AI-native app builder for production-ready web applications.' },
  { file: 'api-reference.html', path: '/api-reference.html', title: 'Huggy API Reference — Projects, Builds, Analytics and Deployments', description: 'Reference for Huggy project, generation, analytics, database and deployment APIs.' },
  { file: 'terms.html', path: '/terms.html', title: 'Huggy Terms - Product Terms and Usage Rules', description: 'Terms for using Huggy to generate, preview, iterate and publish web apps.' },
];

const noindexPages = [
  { file: 'auth.html', path: '/auth.html', title: 'Huggy — Sign In', description: 'Sign in to Huggy.' },
  { file: 'dashboard.html', path: '/dashboard.html', title: 'Huggy — Workspace Dashboard', description: 'Your private Huggy workspace.' },
  { file: 'builder.html', path: '/builder.html', title: 'Huggy — Builder Workspace', description: 'Your private Huggy builder workspace.' },
];

const generatedPages = [
  {
    slug: 'templates',
    title: 'AI App Templates for Production-Ready Web Apps',
    description: 'Start faster with Huggy templates for SaaS dashboards, restaurant apps, marketplaces, landing pages, admin panels and portfolios.',
    h1: 'Templates that become real apps',
    prompt: 'Create a polished SaaS dashboard with authentication, database schema, analytics and responsive preview.',
    cards: ['Restaurant app with bookings, menus and local SEO.', 'SaaS dashboard with metrics, users and billing-ready flows.', 'Marketplace with listings, filters, profiles and admin tools.'],
    faq: ['Can templates still be customized?', 'Yes. Start with a template prompt, then use Plan or Build to adapt every screen, data model and flow.'],
  },
  {
    slug: 'templates/saas-dashboard',
    title: 'AI SaaS Dashboard Template',
    description: 'Generate a SaaS dashboard with metrics, billing-ready UI, settings, user workflows and Supabase-ready schema notes.',
    h1: 'Generate a SaaS dashboard with substance',
    prompt: 'Create a SaaS dashboard with analytics cards, customer table, billing settings, admin roles and Supabase schema.',
    cards: ['Data-dense dashboard UI.', 'Settings, teams and billing workflows.', 'Supabase-ready schema notes.'],
    faq: ['Is this only a mock dashboard?', 'No. Huggy can generate project files, schema notes, preview and deployable output.'],
  },
  {
    slug: 'templates/marketplace',
    title: 'AI Marketplace App Template',
    description: 'Build a marketplace app with listings, vendor profiles, search, filters, payments placeholders and admin workflows.',
    h1: 'Launch a marketplace MVP faster',
    prompt: 'Create a marketplace app with listings, vendor profiles, search filters, checkout placeholders and admin moderation.',
    cards: ['Listings, profiles and search.', 'Admin moderation flows.', 'Payment-ready placeholders for Stripe.'],
    faq: ['Can Huggy ask for API keys?', 'Yes. When a build needs Stripe or other services, Huggy can ask for keys or continue with placeholders.'],
  },
  {
    slug: 'templates/admin-panel',
    title: 'AI Admin Panel Template',
    description: 'Generate admin panels with tables, filters, permissions, audit views and responsive operational UI.',
    h1: 'Admin panels without generic UI',
    prompt: 'Create an admin panel with user management, permissions, audit log, filters, table actions and clean operational UI.',
    cards: ['Tables, filters and bulk actions.', 'Roles and permission screens.', 'Audit and activity views.'],
    faq: ['Is it optimized for repeated use?', 'The prompt asks for dense, scannable operational UI rather than decorative marketing sections.'],
  },
  {
    slug: 'templates/portfolio',
    title: 'AI Portfolio Website Template',
    description: 'Generate a distinctive portfolio with case studies, services, contact flow, SEO metadata and responsive presentation.',
    h1: 'Portfolio pages that do not look generated',
    prompt: 'Create a premium portfolio website with case studies, services, contact form, SEO metadata and strong editorial design.',
    cards: ['Case studies and service pages.', 'Editorial design direction.', 'SEO-ready project storytelling.'],
    faq: ['Can it avoid template-looking designs?', 'Huggy uses its anti-generic UI generation policy to vary typography, layout and visual rhythm.'],
  },
  {
    slug: 'templates/landing-page',
    title: 'AI Landing Page Builder Template',
    description: 'Generate SEO-ready landing pages with differentiated design, strong hierarchy, social proof, FAQs and conversion-focused CTA.',
    h1: 'Generate landing pages built to convert and rank',
    prompt: 'Create an SEO-ready landing page for a B2B SaaS with strong positioning, proof, FAQ, pricing preview and conversion CTA.',
    cards: ['Positioning and proof blocks.', 'FAQ and structured content.', 'Conversion CTA connected to builder handoff.'],
    faq: ['Does Huggy create simple landing pages only?', 'No. It can create full apps or landing pages depending on the selected Build or Plan mode.'],
  },
  {
    slug: 'use-cases',
    title: 'Huggy Use Cases — Founders, Product Teams and Agencies',
    description: 'Use Huggy to build startup MVPs, internal tools, client prototypes, SaaS dashboards and production-ready landing pages.',
    h1: 'AI app building for real product work',
    prompt: 'Plan a startup MVP with landing page, dashboard, database schema, analytics and launch checklist.',
    cards: ['Founders validate ideas faster.', 'Product teams prototype workflows.', 'Agencies deliver client demos with cleaner handoff.'],
    faq: ['Who is Huggy for?', 'Huggy is built for non-technical founders, product teams, agencies and developers who want speed without cheap-looking output.'],
  },
  {
    slug: 'use-cases/non-technical-founders',
    title: 'AI App Builder for Non-Technical Founders',
    description: 'Turn a product idea into a planned or generated web app with Huggy Plan/Build, preview, database and deployment workflows.',
    h1: 'From idea to app without pretending it is magic',
    prompt: 'Create a founder MVP for a booking SaaS with landing page, onboarding, dashboard and database schema.',
    cards: ['Plan first when the idea is fuzzy.', 'Build when requirements are clear.', 'Preview, iterate and publish.'],
    faq: ['Does Huggy code every message?', 'No. Plan mode never modifies files, and Build is the only mode that changes the app.'],
  },
  {
    slug: 'use-cases/product-teams',
    title: 'AI App Builder for Product Teams',
    description: 'Prototype dashboards, portals and product workflows with AI while keeping project context, files and preview synchronized.',
    h1: 'Product teams need fast prototypes that survive review',
    prompt: 'Create a product team prototype for a customer portal with dashboard, account settings and analytics.',
    cards: ['Design review-ready UI.', 'Project state persists across sessions.', 'Database and analytics visible in builder.'],
    faq: ['Can teams use it for internal tools?', 'Yes. Huggy supports dashboard, admin and internal-tool app types.'],
  },
  {
    slug: 'use-cases/agencies',
    title: 'AI App Builder for Agencies',
    description: 'Generate polished client demos, landing pages and MVPs with code export, preview, domains and deployment workflow.',
    h1: 'Client demos that feel designed, not assembled',
    prompt: 'Create a client-ready landing page and dashboard concept for a boutique agency project.',
    cards: ['Faster first drafts.', 'Exportable code.', 'SEO and domain-ready launch path.'],
    faq: ['Can agencies export code?', 'Huggy includes generated project files and code export workflows.'],
  },
  {
    slug: 'use-cases/startup-mvp',
    title: 'Build a Startup MVP With AI',
    description: 'Use Huggy to plan, generate, preview and deploy a startup MVP with database-ready structure and SEO landing pages.',
    h1: 'Build the MVP, not just the mockup',
    prompt: 'Create a startup MVP with homepage, onboarding, dashboard, pricing, database schema and SEO pages.',
    cards: ['Landing page plus app shell.', 'Database-ready project files.', 'SEO and analytics from the beginning.'],
    faq: ['What should founders build first?', 'Start with Plan for scope, then Build the smallest workflow that proves the business idea.'],
  },
  {
    slug: 'use-cases/internal-tools',
    title: 'AI Internal Tool Builder',
    description: 'Generate internal tools, admin screens and operational dashboards with scannable UI, permissions and database notes.',
    h1: 'Internal tools should be quiet and useful',
    prompt: 'Create an internal tool with data table, filters, approval workflow, role controls and audit log.',
    cards: ['Dense operational layouts.', 'Role and approval flows.', 'Audit-friendly screens.'],
    faq: ['Will Huggy make marketing-style dashboards?', 'The generation policy adapts by app type, so operational tools stay restrained and scannable.'],
  },
  {
    slug: 'comparisons',
    title: 'Huggy Comparisons — Alternatives to Lovable, Bolt, Cursor and Replit',
    description: 'Compare Huggy against popular AI builders by workflow, SEO, Supabase readiness, design quality, preview, export and deployment.',
    h1: 'Choose the AI builder for the work you actually ship',
    prompt: 'Compare Huggy with Lovable and Bolt for a Supabase-ready SaaS MVP.',
    cards: ['Lovable alternative for SEO-ready projects.', 'Bolt alternative for product workflows.', 'Cursor complement for generated apps.'],
    faq: ['Is Huggy trying to replace every tool?', 'No. Huggy focuses on AI-native app generation with preview, database visibility, SEO and deployment.'],
  },
  {
    slug: 'comparisons/lovable-alternative',
    title: 'Lovable Alternative With Supabase, SEO and Premium UI',
    description: 'Compare Huggy as a Lovable alternative for founders who want Plan/Build, SEO-ready apps, database visibility and clean previews.',
    h1: 'A Lovable alternative focused on production shape',
    prompt: 'Create a Lovable-style SaaS MVP with Supabase schema, SEO landing page, dashboard and deployment-ready files.',
    cards: ['Plan/Build separation.', 'Database and Analysis tabs.', 'SEO-ready app generation.'],
    faq: ['Why compare with Lovable?', 'Lovable defines the category; Huggy differentiates through SEO, database visibility and design-generation constraints.'],
  },
  {
    slug: 'comparisons/bolt-alternative',
    title: 'Bolt Alternative for AI Web App Generation',
    description: 'Use Huggy when you want AI app generation with persistent workspace, project database visibility, SEO focus and deployment workflow.',
    h1: 'A Bolt alternative for builders who care about polish',
    prompt: 'Create a Bolt-style web app but with premium UI, SEO metadata, analytics and Supabase schema notes.',
    cards: ['Persistent workspace.', 'SEO and analytics in product.', 'Design quality as a first-class requirement.'],
    faq: ['What makes Huggy different from Bolt?', 'Huggy emphasizes generated app quality, SEO readiness, database visibility and Plan/Build control.'],
  },
  {
    slug: 'comparisons/cursor-alternative',
    title: 'Cursor Alternative for Prompt-to-App Workflows',
    description: 'Huggy complements coding agents by turning product prompts into full web app previews, project files and deployment-ready output.',
    h1: 'When you need the app, not only the editor',
    prompt: 'Create a product-ready app from this idea and ask clarifying questions before building if needed.',
    cards: ['Agent asks questions when scope is fuzzy.', 'Build modifies files only when requested.', 'Preview and deploy workflows are built in.'],
    faq: ['Is Huggy an IDE?', 'No. Huggy is an AI app builder. Cursor is a coding environment; Huggy is optimized for app generation and product workflow.'],
  },
  {
    slug: 'comparisons/replit-alternative',
    title: 'Replit Alternative for AI-Generated Web Apps',
    description: 'Generate, preview and deploy web apps with Huggy when you want AI app creation centered on product output and SEO readiness.',
    h1: 'A Replit alternative for focused AI app creation',
    prompt: 'Create a deployable web app with homepage, dashboard, database schema and SEO-ready metadata.',
    cards: ['Prompt-to-app flow.', 'Product-first preview.', 'SEO and database checks.'],
    faq: ['Can Huggy publish apps?', 'Huggy includes deployment workflows and clear configuration errors when external providers need setup.'],
  },
  {
    slug: 'guides',
    title: 'Huggy Guides — AI App Builder Playbooks',
    description: 'Practical guides for building SaaS MVPs, landing pages, dashboards, internal tools and SEO-ready apps with AI.',
    h1: 'Guides for shipping better AI-built apps',
    prompt: 'Plan the best build sequence for a SaaS MVP with landing page, auth, dashboard, database and SEO.',
    cards: ['Build SaaS MVPs with AI.', 'Create SEO landing pages.', 'Use Supabase with generated apps.'],
    faq: ['Do these guides connect to the builder?', 'Yes. Each guide includes a prompt handoff to start Plan or Build in Huggy.'],
  },
  {
    slug: 'guides/build-saas-mvp-with-ai',
    title: 'How to Build a SaaS MVP With AI',
    description: 'A practical Huggy guide for planning and generating a SaaS MVP with landing page, dashboard, database and deployment path.',
    h1: 'Build a SaaS MVP with fewer dead ends',
    prompt: 'Plan and then build a SaaS MVP with homepage, onboarding, dashboard, billing-ready settings and Supabase schema.',
    cards: ['Start with a narrow workflow.', 'Generate the landing page and app shell together.', 'Use preview, SEO audit and database view before publish.'],
    faq: ['Should I Plan or Build first?', 'Use Plan when scope is not clear. Use Build when the first version can be generated safely.'],
  },
  {
    slug: 'guides/ai-landing-page-seo',
    title: 'AI Landing Page SEO Guide',
    description: 'Create AI-generated landing pages that avoid generic design and include metadata, headings, FAQs, internal links and conversion CTAs.',
    h1: 'AI landing pages need search intent, not filler',
    prompt: 'Create an SEO-ready landing page for an AI productivity SaaS with structured sections, FAQ, social proof and conversion CTA.',
    cards: ['One H1 with clear intent.', 'FAQ and structured metadata.', 'CTA connected to builder handoff.'],
    faq: ['Why do AI landing pages fail?', 'They often look generic and miss search intent. Huggy pushes differentiated UI and SEO structure.'],
  },
  {
    slug: 'guides/supabase-app-builder',
    title: 'Supabase App Builder With AI',
    description: 'Use Huggy to generate Supabase-ready web apps with schema notes, project database visibility and secure secret handling.',
    h1: 'Build Supabase-ready apps with AI',
    prompt: 'Create a Supabase-ready app with auth screens, schema.sql, dashboard, database tab and secure API key placeholders.',
    cards: ['Schema notes in generated files.', 'Database visibility inside builder.', 'Secrets stay server-side.'],
    faq: ['Does Huggy create real Supabase projects per app?', 'The MVP uses shared Supabase isolation by project and organization, with premium dedicated options planned.'],
  },
  {
    slug: 'tools/seo-audit',
    title: 'Free SEO Audit Tool for AI-Generated Apps',
    description: 'Use this free Huggy tool page to audit metadata, headings, social preview and search-readiness before sending a prompt to the builder.',
    h1: 'Audit your generated app before launch',
    prompt: 'Audit my app for SEO issues and generate a prioritized fix list for titles, meta descriptions, headings, alt text and schema.',
    cards: ['Find missing metadata.', 'Check heading structure.', 'Generate one-click SEO fix prompts.'],
    faq: ['Is the tool fully automated?', 'This page starts the workflow; the builder performs the project-specific audit once files exist.'],
  },
  {
    slug: 'tools/prompt-to-app-idea',
    title: 'Prompt to App Idea Generator',
    description: 'Turn a rough product idea into a focused Huggy prompt for building an app, dashboard, marketplace or landing page.',
    h1: 'Turn a vague idea into a usable prompt',
    prompt: 'Turn my idea into a clear app build prompt with target users, key screens, data model and launch page.',
    cards: ['Clarify target users.', 'Define screens and data.', 'Start Plan mode before building.'],
    faq: ['Should I start with a short prompt?', 'Yes. Huggy can ask follow-up questions when the idea needs more precision.'],
  },
  {
    slug: 'tools/landing-page-score',
    title: 'Landing Page Score Tool for AI Builders',
    description: 'Score a landing page idea for clarity, conversion, SEO structure and differentiation before generating it with Huggy.',
    h1: 'Score the landing page before you build it',
    prompt: 'Score this landing page idea for conversion, SEO, audience clarity and design differentiation before building.',
    cards: ['Positioning clarity.', 'SEO intent coverage.', 'Conversion CTA quality.'],
    faq: ['Does this replace analytics?', 'No. It helps before launch; the Analysis tab tracks real project traffic after preview or publish.'],
  },
  {
    slug: 'built-with-huggy',
    title: 'Built With Huggy — AI-Generated App Showcase',
    description: 'A public showcase strategy for apps, landing pages and dashboards generated with Huggy.',
    h1: 'A showcase built for proof and backlinks',
    prompt: 'Create a showcase page for apps built with Huggy, grouped by template, industry and launch status.',
    cards: ['Showcase published apps.', 'Link related templates.', 'Build authority through real examples.'],
    faq: ['Will every app be public?', 'No. Published showcase pages should be opt-in so private projects remain private.'],
  },
  {
    slug: 'prompt-recipes/restaurant-app',
    title: 'Restaurant App Prompt Recipe',
    description: 'A ready-to-use prompt for creating a restaurant app with menu, reservations, reviews, local SEO and mobile-first design.',
    h1: 'Prompt recipe: restaurant app',
    prompt: 'Create a restaurant app with menu, reservations, reviews, map section, local SEO, photo-forward homepage and mobile checkout-style booking flow.',
    cards: ['Designed for local search.', 'Includes conversion paths.', 'Good fit for Plan or Build.'],
    faq: ['Can I edit the recipe?', 'Yes. Click Build or Plan, then adjust the prompt inside Huggy before submitting.'],
  },
  {
    slug: 'prompt-recipes/saas-dashboard',
    title: 'SaaS Dashboard Prompt Recipe',
    description: 'A Huggy prompt recipe for creating a SaaS dashboard with analytics, customer data, settings and Supabase-ready schema.',
    h1: 'Prompt recipe: SaaS dashboard',
    prompt: 'Create a SaaS dashboard with KPI overview, customer table, subscriptions, account settings, team roles, audit log and Supabase schema.sql.',
    cards: ['Operational UI.', 'Data-ready layout.', 'Good foundation for MVPs.'],
    faq: ['Why include schema.sql?', 'It gives the generated app a clearer backend direction and feeds the Database tab.'],
  },
  {
    slug: 'prompt-recipes/marketplace',
    title: 'Marketplace Prompt Recipe',
    description: 'A prompt recipe for creating an AI-generated marketplace with listings, vendor profiles, search, filters and admin moderation.',
    h1: 'Prompt recipe: marketplace',
    prompt: 'Create a marketplace with listings, vendor profiles, search filters, saved items, checkout placeholders, admin moderation and SEO category pages.',
    cards: ['Search and filtering.', 'Vendor workflows.', 'SEO category pages.'],
    faq: ['Can Huggy add payments?', 'Yes, but it will ask for Stripe keys or continue with safe placeholders depending on your choice.'],
  },
];

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function titleCase(value) {
  return String(value).split('/').pop().replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function jsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data, null, 2).replace(/</g, '\\u003c')}</script>`;
}

function faviconHead() {
  return `  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
  <link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta name="theme-color" content="#ffffff" />`;
}

function baseHead(page, url, breadcrumbs = []) {
  const faqQuestion = page.faq?.[0] || 'Can Huggy build this app?';
  const faqAnswer = page.faq?.[1] || 'Yes. Use Plan to refine the idea or Build to generate project files and preview.';
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.title,
      description: page.description,
      url,
      isPartOf: { '@type': 'WebSite', name: 'Huggy', url: siteUrl },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [{
        '@type': 'Question',
        name: faqQuestion,
        acceptedAnswer: { '@type': 'Answer', text: faqAnswer },
      }],
    },
  ];
  if (breadcrumbs.length) {
    schema.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: item.url,
      })),
    });
  }

  return `  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(page.title)} | Huggy</title>
  <meta name="description" content="${esc(page.description)}" />
  <link rel="canonical" href="${url}" />
${faviconHead()}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Huggy" />
  <meta property="og:title" content="${esc(page.title)}" />
  <meta property="og:description" content="${esc(page.description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${siteUrl}/og-huggy.svg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(page.title)}" />
  <meta name="twitter:description" content="${esc(page.description)}" />
  <meta name="twitter:image" content="${siteUrl}/og-huggy.svg" />
${schema.map(jsonLd).join('\n')}`;
}

function sharedPublicFooter(className = 'footer') {
  const cardClass = className === 'seo-footer' ? 'seo-footer-card' : 'footer-grid';
  const brandClass = className === 'seo-footer' ? 'seo-footer-brand' : 'footer-brand';
  const kickerClass = className === 'seo-footer' ? 'seo-footer-kicker' : 'footer-kicker';
  const contactClass = className === 'seo-footer' ? 'seo-footer-contact' : 'footer-contact';
  const wordmarkClass = className === 'seo-footer' ? 'seo-footer-wordmark' : 'footer-wordmark';
  const colClass = className === 'seo-footer' ? 'seo-footer-col' : 'footer-col';
  const linksClass = className === 'seo-footer' ? 'seo-footer-links' : 'footer-links';
  const bottomClass = className === 'seo-footer' ? 'seo-footer-bottom' : 'footer-bottom';
  const legalClass = className === 'seo-footer' ? 'seo-footer-legal' : 'footer-legal';

  return `    <footer class="${className}" aria-labelledby="footer-title">
        <div class="${cardClass}">
            <div class="${brandClass}">
                <div class="${kickerClass}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"></path>
                        <path d="M19 15l.8 2.7L22 18.5l-2.2.8L19 22l-.8-2.7-2.2-.8 2.2-.8L19 15Z"></path>
                    </svg>
                    Contactez-nous
                </div>
                <p id="footer-title">Intéressé par une collaboration, <span>essayer Huggy ou simplement en savoir plus ?</span></p>
                <div class="${contactClass}">
                    <span>Contactez-nous :</span>
                    <a href="mailto:contact@huggy.fun">contact@huggy.fun</a>
                </div>
                <a class="${wordmarkClass}" href="/" aria-label="Huggy home">huggy</a>
            </div>
            <div class="${colClass}">
                <h5>Navigation</h5>
                <ul class="${linksClass}">
                    <li><a href="/about.html">À propos</a></li>
                    <li><a href="/pricing.html">Tarifs</a></li>
                    <li><a href="/templates/">Templates</a></li>
                    <li><a href="/comparisons/">Comparisons</a></li>
                    <li><a href="/documentation.html">Documentation</a></li>
                    <li><a href="/security.html">Security</a></li>
                    <li><a href="mailto:contact@huggy.fun">Contact</a></li>
                </ul>
            </div>
            <div class="${bottomClass}">
                <span>© 2026 Huggy. Tous droits réservés.</span>
                <div class="${legalClass}">
                    <a href="/privacy.html">Confidentialité</a>
                    <a href="/security.html">Sécurité</a>
                    <a href="/terms.html">CGU</a>
                    <a href="https://www.huggy.fun/">huggy.fun</a>
                </div>
            </div>
        </div>
    </footer>`;
}

function renderPage(page) {
  const url = `${siteUrl}/${page.slug.replace(/\/?$/, '/')}`;
  const parent = page.slug.includes('/') ? page.slug.split('/')[0] : page.slug;
  const breadcrumbs = [
    { name: 'Huggy', url: `${siteUrl}/` },
    ...(parent !== page.slug ? [{ name: titleCase(parent), url: `${siteUrl}/${parent}/` }] : []),
    { name: titleCase(page.slug), url },
  ];
  return `<!DOCTYPE html>
<html lang="en" data-page="${esc(page.slug)}">
<head>
${baseHead(page, url, breadcrumbs)}
</head>
<body>
  <div class="seo-shell">
    <nav class="seo-nav" aria-label="Main navigation">
      <a class="seo-brand" href="/"><span class="seo-brand-mark">H</span><span>Huggy</span></a>
      <div class="seo-nav-links">
        <a href="/templates/">Templates</a>
        <a href="/use-cases/">Use cases</a>
        <a href="/comparisons/">Comparisons</a>
        <a href="/guides/">Guides</a>
        <a class="seo-pill" href="/pricing.html">Pricing</a>
      </div>
    </nav>
    <main>
      <section class="seo-hero">
        <div>
          <div class="seo-kicker">AI app builder</div>
          <h1>${esc(page.h1)}</h1>
          <p class="seo-lead">${esc(page.description)}</p>
        </div>
        <aside class="seo-panel" data-seo-prompt-form>
          <div class="seo-prompt">
            <label for="seo-prompt-${page.slug.replace(/\W/g, '-')}">Start from this prompt</label>
            <textarea id="seo-prompt-${page.slug.replace(/\W/g, '-')}" data-seo-prompt>${esc(page.prompt)}</textarea>
            <input type="hidden" data-seo-mode value="build" />
            <div class="seo-actions">
              <button class="seo-button" type="button" data-seo-submit>Build with Huggy</button>
              <button class="seo-button secondary" type="button" data-seo-mode-button="plan">Plan first</button>
              <button class="seo-button secondary" type="button" data-seo-mode-button="build">Build mode</button>
            </div>
          </div>
        </aside>
      </section>
      <section class="seo-section">
        <h2>Why this wins search intent</h2>
        <div class="seo-grid">
          ${page.cards.map((card, index) => `<article class="seo-card"><h3>${esc(['Focused prompt', 'Production shape', 'Search-ready structure'][index] || 'Huggy advantage')}</h3><p>${esc(card)}</p></article>`).join('\n          ')}
        </div>
      </section>
      <section class="seo-section">
        <h2>What Huggy should generate</h2>
        <div class="seo-grid">
          <article class="seo-card"><h3>Semantic pages</h3><p>Clear H1, section hierarchy, metadata, Open Graph and structured content aligned to the app type.</p></article>
          <article class="seo-card"><h3>Real product workflow</h3><p>Project files, responsive preview, database visibility, analytics and deployment path instead of a static mock.</p></article>
          <article class="seo-card"><h3>Builder handoff</h3><p>Every page can send a tailored prompt into Huggy so visitors move from search intent to creation.</p></article>
        </div>
      </section>
      <section class="seo-section">
        <h2>Questions before building</h2>
        <div class="seo-faq">
          <details open><summary>${esc(page.faq[0])}</summary><p>${esc(page.faq[1])}</p></details>
          <details><summary>Should I use Plan or Build?</summary><p>Use Plan when the idea is fuzzy. Use Build when the first version is clear enough to safely generate project files and preview.</p></details>
          <details><summary>How does this help people find the app?</summary><p>Huggy gives each generated app clear structure, metadata, useful content prompts and internal links that search engines and AI answer systems can understand.</p></details>
        </div>
      </section>
    </main>
${sharedPublicFooter('seo-footer')}
  </div>
  <script type="module" src="/src/seo-pages.ts"></script>
</body>
</html>
`;
}

function write(filePath, content) {
  const full = path.join(root, filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function injectHeadMeta(page) {
  const full = path.join(root, page.file);
  if (!fs.existsSync(full)) return;
  let html = fs.readFileSync(full, 'utf8');
  const url = `${siteUrl}${page.path}`;
  const markerStart = '<!-- HUGGY_SEO_START -->';
  const markerEnd = '<!-- HUGGY_SEO_END -->';
  const robots = noindexPages.some(item => item.file === page.file) ? '<meta name="robots" content="noindex, nofollow" />' : '<meta name="robots" content="index, follow" />';
  const schema = page.path === '/'
    ? [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Huggy',
        url: siteUrl,
        logo: `${siteUrl}/favicon.svg`,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Huggy',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        description: page.description,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Huggy AI App Builder',
        description: page.description,
        brand: { '@type': 'Brand', name: 'Huggy' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: 'What is Huggy?', acceptedAnswer: { '@type': 'Answer', text: 'Huggy is an AI app builder for generating production-ready web apps with database, preview, deployment and SEO-ready structure.' } },
          { '@type': 'Question', name: 'Can Huggy generate SEO-ready apps?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Huggy guides generated apps toward semantic HTML, metadata, Open Graph, analytics and SEO audit workflows.' } },
        ],
      },
    ]
    : [{
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.title,
      description: page.description,
      url,
    }];
  const block = `${markerStart}
  <meta name="description" content="${esc(page.description)}" />
  ${robots}
  <link rel="canonical" href="${url}" />
${faviconHead()}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Huggy" />
  <meta property="og:title" content="${esc(page.title)}" />
  <meta property="og:description" content="${esc(page.description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${siteUrl}/og-huggy.svg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(page.title)}" />
  <meta name="twitter:description" content="${esc(page.description)}" />
  <meta name="twitter:image" content="${siteUrl}/og-huggy.svg" />
  ${schema.map(jsonLd).join('\n  ')}
  ${markerEnd}`;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);
  if (html.includes(markerStart)) {
    html = html.replace(new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`), block);
  } else {
    html = html.replace(/<\/title>/, `</title>\n  ${block}`);
  }
  fs.writeFileSync(full, html, 'utf8');
}

function updateExistingFooter(page) {
  const full = path.join(root, page.file);
  if (!fs.existsSync(full)) return;
  let html = fs.readFileSync(full, 'utf8');
  if (!html.includes('<footer class="footer"')) return;
  html = html.replace(/    <footer class="footer"[\s\S]*?    <\/footer>/, sharedPublicFooter('footer'));
  fs.writeFileSync(full, html, 'utf8');
}

function generatePublicAssets(urls) {
  write('public/robots.txt', `User-agent: *\nAllow: /\nDisallow: /auth.html\nDisallow: /dashboard.html\nDisallow: /builder.html\nSitemap: ${siteUrl}/sitemap.xml\n`);
  write('public/llms.txt', `# Huggy\n\nHuggy is an AI app builder for creating, previewing, iterating and publishing production-ready web apps.\n\n## Important pages\n- Home: ${siteUrl}/\n- Pricing: ${siteUrl}/pricing.html\n- Features: ${siteUrl}/features.html\n- Documentation: ${siteUrl}/documentation.html\n- Templates: ${siteUrl}/templates/\n- Use cases: ${siteUrl}/use-cases/\n- Comparisons: ${siteUrl}/comparisons/\n- Guides: ${siteUrl}/guides/\n\n## Product facts\n- Huggy supports prompt-to-app generation, project preview, database visibility, publishing workflows and model selection.\n- Huggy is designed for founders, agencies, product teams and non-technical builders.\n- Private app routes such as auth, dashboard and builder are not intended for indexing.\n`);
  write('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${url}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>${url === siteUrl + '/' ? '1.0' : '0.8'}</priority></url>`).join('\n')}\n</urlset>\n`);
  write('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>.icon-bg{fill:#09090b}.icon-fill{fill:#ffffff}@media (prefers-color-scheme:dark){.icon-bg{fill:#ffffff}.icon-fill{fill:#09090b}}</style><rect class="icon-bg" width="32" height="32" rx="8"/><path class="icon-fill" d="M16 8L25 13.5V14.5L16 9.5L7 14.5V13.5L16 8Z"/><path class="icon-fill" d="M7 16.5V24.5L11.5 22V14L7 16.5Z"/><path class="icon-fill" d="M25 16.5V24.5L16 24.5V22H20.5V14L25 16.5Z"/></svg>\n`);
  write('public/og-huggy.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#ffffff"/><circle cx="1040" cy="100" r="260" fill="#09090b" opacity=".05"/><circle cx="150" cy="540" r="300" fill="#3b7a8c" opacity=".10"/><rect x="84" y="82" width="1032" height="466" rx="42" fill="#ffffff" stroke="#09090b" stroke-opacity=".12"/><text x="138" y="220" font-family="Arial, sans-serif" font-size="64" font-weight="800" fill="#09090b">Huggy</text><text x="138" y="310" font-family="Arial, sans-serif" font-size="54" font-weight="700" fill="#09090b">Build apps people can use and find.</text><text x="138" y="386" font-family="Arial, sans-serif" font-size="28" fill="#52525b">AI app builder with database, preview, deploy and SEO-ready output.</text></svg>\n`);
}

function main() {
  generatedPages.forEach(page => write(path.join(page.slug, 'index.html'), renderPage(page)));
  existingPages.forEach(updateExistingFooter);
  [...existingPages, ...noindexPages].forEach(injectHeadMeta);
  const urls = [
    ...existingPages.map(page => `${siteUrl}${page.path}`),
    ...generatedPages.map(page => `${siteUrl}/${page.slug.replace(/\/?$/, '/')}`),
  ];
  generatePublicAssets(Array.from(new Set(urls)));
}

main();
