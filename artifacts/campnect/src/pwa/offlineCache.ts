export interface CacheConfig {
  maxAgeSeconds: number;
  cacheName: string;
}

export class OfflineCacheManager {
  private cacheName: string;

  constructor(cacheName = 'campnect-offline-v1') {
    this.cacheName = cacheName;
  }

  async getCachedResponse(request: RequestInfo): Promise<Response | null> {
    if (typeof window === 'undefined' || !('caches' in window)) return null;
    const cache = await caches.open(this.cacheName);
    return (await cache.match(request)) || null;
  }

  async cacheResponse(request: RequestInfo, response: Response): Promise<void> {
    if (typeof window === 'undefined' || !('caches' in window)) return;
    const cache = await caches.open(this.cacheName);
    await cache.put(request, response.clone());
  }

  async clearOutdatedCaches(currentName: string): Promise<void> {
    if (typeof window === 'undefined' || !('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('campnect-') && k !== currentName)
        .map((k) => caches.delete(k))
    );
  }
}
