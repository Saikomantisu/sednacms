declare module 'virtual:sedna/collections' {
  export const collections: Record<string, { loader?: unknown }>;
}
declare module 'virtual:sedna/admin' {
  export const favicon: string;
  export const uploadsEnabled: boolean;
}
declare module 'virtual:sedna/storage' {
  export const storage: import('./storage/config.js').StorageAdapter | null;
}
declare module 'virtual:sedna/cache' {
  export const cache: false | import('./cache.js').CacheOptions;
}
declare module '*.wasm?url' {
  const url: string;
  export default url;
}
