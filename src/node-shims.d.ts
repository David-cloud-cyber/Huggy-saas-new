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
