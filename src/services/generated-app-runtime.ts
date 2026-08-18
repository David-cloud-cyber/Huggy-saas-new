export type GeneratedAppProfile = 'tanstack-fullstack' | 'vite-static' | 'legacy-vite-fullstack';
export type GeneratedAppFramework = 'tanstack-start' | 'vite-react';
export type GeneratedAppRuntime = 'cloudflare-workers' | 'static-assets';

export type GeneratedAppCapability = {
  ssr: boolean;
  auth: boolean;
  database: boolean;
  storage: boolean;
  realtime: boolean;
  payments: boolean;
  serverFunctions: boolean;
};

export type GeneratedAppRoute = {
  path: string;
  kind: 'public' | 'protected' | 'server' | 'unknown';
};

export type GeneratedAppEnvRequirement = {
  name: string;
  scope: 'public' | 'server';
  required: boolean;
  description: string;
};

export type GeneratedAppManifest = {
  schemaVersion: 1;
  profile: GeneratedAppProfile;
  framework: GeneratedAppFramework;
  runtime: GeneratedAppRuntime;
  backend: 'huggy-cloud-supabase' | 'none';
  buildCommand: string;
  devCommand: string;
  outputDirectory: string;
  routes: GeneratedAppRoute[];
  requiredPublicEnv: GeneratedAppEnvRequirement[];
  requiredServerEnv: GeneratedAppEnvRequirement[];
  capabilities: GeneratedAppCapability;
  acceptanceCriteria: string[];
  generatedAt: string;
};

export type GeneratedRuntimeFile = {
  path: string;
  content: string;
};

type RuntimeRequirement = {
  needs_auth?: boolean;
  needs_database?: boolean;
  needs_storage?: boolean;
  needs_realtime?: boolean;
  needs_edge_functions?: boolean;
  needs_secrets?: boolean;
};

function normalizePath(value: string) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function fileContent(files: GeneratedRuntimeFile[], path: string) {
  const target = normalizePath(path).toLowerCase();
  return files.find(file => normalizePath(file.path).toLowerCase() === target)?.content || '';
}

function packageJson(files: GeneratedRuntimeFile[]) {
  try {
    return JSON.parse(fileContent(files, 'package.json') || '{}');
  } catch {
    return {};
  }
}

function packageHas(pkg: any, name: string) {
  return Boolean(pkg?.dependencies?.[name] || pkg?.devDependencies?.[name] || pkg?.peerDependencies?.[name]);
}

function contains(files: GeneratedRuntimeFile[], pattern: RegExp) {
  return files.some(file => pattern.test(String(file.content || '')));
}

function hasTanStackStart(files: GeneratedRuntimeFile[]) {
  const pkg = packageJson(files);
  return packageHas(pkg, '@tanstack/react-start') || contains(files, /@tanstack\/react-start|createServerFn|@tanstack\/react-start\/server-entry/i);
}

function hasTanStackRouter(files: GeneratedRuntimeFile[]) {
  const pkg = packageJson(files);
  return packageHas(pkg, '@tanstack/react-router') || contains(files, /@tanstack\/react-router|createFileRoute/i);
}

function hasTanStackQuery(files: GeneratedRuntimeFile[]) {
  const pkg = packageJson(files);
  return packageHas(pkg, '@tanstack/react-query') || contains(files, /@tanstack\/react-query|QueryClient|useQuery/i);
}

function hasServerEntry(files: GeneratedRuntimeFile[]) {
  return Boolean(fileContent(files, 'src/server.ts') || fileContent(files, 'server.ts') || contains(files, /createServerEntry|server-only|createServerFn/i));
}

function inferRoutes(files: GeneratedRuntimeFile[]): GeneratedAppRoute[] {
  const routes: GeneratedAppRoute[] = [];
  for (const file of files) {
    const path = normalizePath(file.path);
    const match = path.match(/(?:^|\/)routes\/(.+)\.(?:tsx|ts|jsx|js)$/i);
    if (!match) continue;
    const routeName = match[1].replace(/\/index$/i, '').replace(/__root$/i, '');
    const routePath = routeName ? `/${routeName.replace(/\./g, '/')}` : '/';
    routes.push({
      path: routePath,
      kind: /auth|login|signup|account|dashboard|settings/i.test(routeName) ? 'protected' : 'public',
    });
  }
  if (!routes.length && fileContent(files, 'index.html')) routes.push({ path: '/', kind: 'public' });
  return routes.slice(0, 100);
}

export function resolveGeneratedAppProfile(input: {
  prompt?: string;
  files: GeneratedRuntimeFile[];
  requirement?: RuntimeRequirement;
}): GeneratedAppProfile {
  const pkg = packageJson(input.files);
  const hasBackend = Boolean(
    input.requirement?.needs_auth ||
    input.requirement?.needs_database ||
    input.requirement?.needs_storage ||
    input.requirement?.needs_realtime ||
    input.requirement?.needs_edge_functions ||
    input.requirement?.needs_secrets ||
    packageHas(pkg, '@supabase/supabase-js') ||
    contains(input.files, /supabase|huggyCloud|server function|server-only/i),
  );

  if (hasTanStackStart(input.files)) return 'tanstack-fullstack';
  if (hasBackend) return 'legacy-vite-fullstack';
  return 'vite-static';
}

export function createGeneratedAppManifest(input: {
  prompt?: string;
  files: GeneratedRuntimeFile[];
  requirement?: RuntimeRequirement;
  now?: string;
}): GeneratedAppManifest {
  const pkg = packageJson(input.files);
  const profile = resolveGeneratedAppProfile(input);
  const tanstack = hasTanStackStart(input.files);
  const hasAuth = Boolean(input.requirement?.needs_auth || contains(input.files, /supabase\.auth|signIn|signUp|ProtectedRoute|authGuard|createServerFn.*auth/i));
  const hasDatabase = Boolean(input.requirement?.needs_database || packageHas(pkg, '@supabase/supabase-js') || contains(input.files, /\.from\(|schema\.sql|appData|supabase/i));
  const hasStorage = Boolean(input.requirement?.needs_storage || contains(input.files, /storage\.from|upload|bucket|storage\.objects/i));
  const hasRealtime = Boolean(input.requirement?.needs_realtime || contains(input.files, /channel\(|realtime|postgres_changes/i));
  const hasPayments = contains(input.files, /stripe|checkout|payment|subscription|invoice/i);
  const hasServerFunctions = Boolean(input.requirement?.needs_edge_functions || input.requirement?.needs_secrets || hasServerEntry(input.files) || contains(input.files, /supabase\/functions|server function|createServerFn/i));
  const fullstack = profile === 'tanstack-fullstack';

  return {
    schemaVersion: 1,
    profile,
    framework: tanstack ? 'tanstack-start' : 'vite-react',
    runtime: fullstack ? 'cloudflare-workers' : 'static-assets',
    backend: hasDatabase || hasAuth || hasStorage || hasRealtime || hasServerFunctions || hasPayments
      ? 'huggy-cloud-supabase'
      : 'none',
    buildCommand: fullstack && tanstack ? 'npm run build' : 'npm run build',
    devCommand: 'npm run dev',
    outputDirectory: 'dist',
    routes: inferRoutes(input.files),
    requiredPublicEnv: (hasDatabase || hasAuth)
      ? [
          { name: 'VITE_HUGGY_CLOUD_SUPABASE_URL', scope: 'public', required: true, description: 'URL publique du backend Huggy Cloud.' },
          { name: 'VITE_HUGGY_CLOUD_SUPABASE_ANON_KEY', scope: 'public', required: true, description: 'Clé publishable du backend Huggy Cloud.' },
        ]
      : [],
    requiredServerEnv: input.requirement?.needs_secrets || hasServerFunctions
      ? [{ name: 'HUGGY_SERVER_RUNTIME', scope: 'server', required: true, description: 'Configuration serveur injectée par le runtime Huggy/Cloudflare.' }]
      : [],
    capabilities: {
      ssr: tanstack,
      auth: hasAuth,
      database: hasDatabase,
      storage: hasStorage,
      realtime: hasRealtime,
      payments: hasPayments,
      serverFunctions: hasServerFunctions,
    },
    acceptanceCriteria: [
      'Le build de production termine sans erreur.',
      'Les routes principales répondent après publication.',
      'Aucun secret serveur ne se trouve dans le bundle client.',
      ...(hasDatabase || hasAuth ? ['Les accès privés utilisent une session et des policies RLS vérifiables.'] : []),
      ...(tanstack ? ['Le rendu SSR/hydration ne produit aucune erreur de mismatch.'] : []),
    ],
    generatedAt: input.now || new Date().toISOString(),
  };
}

export function validateGeneratedAppManifest(manifest: GeneratedAppManifest): string[] {
  const errors: string[] = [];
  if (manifest.schemaVersion !== 1) errors.push('Unsupported generated app manifest schema.');
  if (!manifest.profile || !manifest.framework || !manifest.runtime) errors.push('Runtime profile is incomplete.');
  if (!manifest.buildCommand || !manifest.outputDirectory) errors.push('Build contract is incomplete.');
  if (manifest.profile === 'tanstack-fullstack' && manifest.runtime !== 'cloudflare-workers') {
    errors.push('TanStack fullstack apps must target the Cloudflare Workers runtime.');
  }
  if (manifest.backend !== 'none' && !manifest.requiredPublicEnv.some(env => env.name.includes('SUPABASE'))) {
    errors.push('Backend applications must declare public runtime configuration.');
  }
  return errors;
}

export function manifestFile(input: Parameters<typeof createGeneratedAppManifest>[0]): GeneratedRuntimeFile {
  const manifest = createGeneratedAppManifest(input);
  const errors = validateGeneratedAppManifest(manifest);
  if (manifest.profile === 'tanstack-fullstack') {
    if (!hasTanStackRouter(input.files)) errors.push('TanStack fullstack apps must include TanStack Router.');
    if (!hasTanStackQuery(input.files)) errors.push('TanStack fullstack apps must include TanStack Query for server state.');
    if (!fileContent(input.files, 'wrangler.jsonc') && !fileContent(input.files, 'wrangler.toml')) {
      errors.push('TanStack fullstack apps must include a Cloudflare Wrangler configuration.');
    }
  }
  if (errors.length) throw new Error(`Invalid generated app manifest: ${errors.join(' ')}`);
  return {
    path: 'huggy/app-manifest.json',
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  };
}
