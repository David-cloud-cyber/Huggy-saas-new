declare module 'path' {
  const path: {
    resolve: (...segments: string[]) => string;
  };
  export default path;
}

declare const __dirname: string;

declare const process: {
  env: Record<string, string | undefined>;
};

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
