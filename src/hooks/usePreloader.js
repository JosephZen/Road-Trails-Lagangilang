import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * Hook for preloading panorama images into browser memory.
 * Implements LRU-style caching with Blob URLs for instant texture swaps.
 */
export function usePreloader(currentPanoId, panoramas, maxCacheSize = 20) {
  const cacheRef = useRef(new Map()); // id -> { blobUrl, timestamp }
  const [preloadStatus, setPreloadStatus] = useState({
    cached: 0,
    loading: false,
    neighbors: [],
  });

  /**
   * Fetch an image and convert to blob URL for instant access.
   */
  const preloadImage = useCallback(async (pano) => {
    if (!pano) return null;

    // Check cache first
    if (cacheRef.current.has(pano.id)) {
      const entry = cacheRef.current.get(pano.id);
      entry.timestamp = Date.now();
      return entry.blobUrl;
    }

    try {
      // First try thumbnail for instant preview
      const thumbUrl = `${API_BASE}/panoramas/thumbnails/${pano.id}_thumb.jpg`;
      const fullUrl = `${API_BASE}/panoramas/${pano.filename}`;

      // Preload thumbnail
      const thumbResponse = await fetch(thumbUrl);
      if (thumbResponse.ok) {
        const thumbBlob = await thumbResponse.blob();
        const thumbBlobUrl = URL.createObjectURL(thumbBlob);

        // Store thumbnail in cache
        cacheRef.current.set(`${pano.id}_thumb`, {
          blobUrl: thumbBlobUrl,
          timestamp: Date.now(),
        });
      }

      // Preload full image
      const fullResponse = await fetch(fullUrl);
      if (fullResponse.ok) {
        const fullBlob = await fullResponse.blob();
        const fullBlobUrl = URL.createObjectURL(fullBlob);

        cacheRef.current.set(pano.id, {
          blobUrl: fullBlobUrl,
          timestamp: Date.now(),
        });

        // Evict old entries if cache is too large
        evictCache();

        return fullBlobUrl;
      }
    } catch (err) {
      console.warn(`Failed to preload panorama ${pano.id}:`, err);
    }

    return null;
  }, []);

  /**
   * Evict least-recently-used entries when cache exceeds max size.
   */
  const evictCache = useCallback(() => {
    const cache = cacheRef.current;
    if (cache.size <= maxCacheSize) return;

    // Sort entries by timestamp, evict oldest
    const entries = [...cache.entries()].sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );

    while (cache.size > maxCacheSize) {
      const [key, entry] = entries.shift();
      URL.revokeObjectURL(entry.blobUrl);
      cache.delete(key);
    }
  }, [maxCacheSize]);

  /**
   * Preload all neighbors of the current panorama.
   */
  useEffect(() => {
    if (!currentPanoId || !panoramas || panoramas.length === 0) return;

    const currentPano = panoramas.find((p) => p.id === currentPanoId);
    if (!currentPano || !currentPano.neighbors) return;

    const neighborPanos = currentPano.neighbors
      .map((id) => panoramas.find((p) => p.id === id))
      .filter(Boolean);

    setPreloadStatus((prev) => ({
      ...prev,
      loading: true,
      neighbors: currentPano.neighbors,
    }));

    // Preload all neighbors in parallel
    Promise.all(neighborPanos.map((pano) => preloadImage(pano))).then(() => {
      setPreloadStatus({
        cached: cacheRef.current.size,
        loading: false,
        neighbors: currentPano.neighbors,
      });
    });
  }, [currentPanoId, panoramas, preloadImage]);

  /**
   * Get cached URL for a panorama (blob URL if preloaded, otherwise server URL).
   */
  const getCachedUrl = useCallback((panoId, useThumbnail = false) => {
    const key = useThumbnail ? `${panoId}_thumb` : panoId;
    const entry = cacheRef.current.get(key);

    if (entry) {
      entry.timestamp = Date.now();
      return entry.blobUrl;
    }

    // Fallback to server URL
    const pano = panoramas?.find((p) => p.id === panoId);
    if (!pano) return null;

    if (useThumbnail) {
      return `${API_BASE}/panoramas/thumbnails/${pano.id}_thumb.jpg`;
    }
    return `${API_BASE}/panoramas/${pano.filename}`;
  }, [panoramas]);

  /**
   * Cleanup all blob URLs on unmount.
   */
  useEffect(() => {
    return () => {
      cacheRef.current.forEach((entry) => {
        URL.revokeObjectURL(entry.blobUrl);
      });
      cacheRef.current.clear();
    };
  }, []);

  return {
    preloadStatus,
    getCachedUrl,
    preloadImage,
    cacheSize: cacheRef.current.size,
  };
}
