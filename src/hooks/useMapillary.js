import { useState, useCallback } from 'react';

const MAPILLARY_GRAPH_API = 'https://graph.mapillary.com';
const ACCESS_TOKEN = 'MLY|28125741697049683|b57c41e6691fc16e7559d980e08c82c9';

/**
 * Hook for interacting with the Mapillary API v4.
 * Handles searching for nearby images, fetching image details, and sequences.
 */
export function useMapillary() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Search for Mapillary images near a given lat/lng.
   */
  const searchNearby = useCallback(async (lat, lng, radius = 100) => {
    setLoading(true);
    setError(null);

    try {
      const fields = 'id,geometry,compass_angle,captured_at,is_pano,thumb_1024_url,sequence';
      const delta = 0.009;
      const url = `${MAPILLARY_GRAPH_API}/images?access_token=${ACCESS_TOKEN}&fields=${fields}&bbox=${lng - delta},${lat - delta},${lng + delta},${lat + delta}&limit=100`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Mapillary API error: ${response.status}`);

      const data = await response.json();

      let items = (data.data || []).map((img) => ({
        id: String(img.id),
        lat: img.geometry?.coordinates?.[1],
        lng: img.geometry?.coordinates?.[0],
        heading: img.compass_angle,
        capturedAt: img.captured_at,
        isPano: img.is_pano,
        thumbUrl: img.thumb_1024_url,
        sequenceId: img.sequence,
      }));

      // If nothing within tight bbox, expand to ~2.5km to ensure sequence clicks always find images
      if (items.length === 0) {
        const widerDelta = 0.025;
        const widerUrl = `${MAPILLARY_GRAPH_API}/images?access_token=${ACCESS_TOKEN}&fields=${fields}&bbox=${lng - widerDelta},${lat - widerDelta},${lng + widerDelta},${lat + widerDelta}&limit=100`;
        const widerRes = await fetch(widerUrl);
        if (widerRes.ok) {
          const widerData = await widerRes.json();
          items = (widerData.data || []).map((img) => ({
            id: String(img.id),
            lat: img.geometry?.coordinates?.[1],
            lng: img.geometry?.coordinates?.[0],
            heading: img.compass_angle,
            capturedAt: img.captured_at,
            isPano: img.is_pano,
            thumbUrl: img.thumb_1024_url,
            sequenceId: img.sequence,
          }));
        }
      }

      setLoading(false);

      // Sort: 360 spherical panoramas prioritized first, then closest by distance
      items.sort((a, b) => {
        if (a.isPano && !b.isPano) return -1;
        if (!a.isPano && b.isPano) return 1;
        const distA = Math.hypot(a.lat - lat, a.lng - lng);
        const distB = Math.hypot(b.lat - lat, b.lng - lng);
        return distA - distB;
      });

      return items;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return [];
    }
  }, []);

  /**
   * Get details for a specific Mapillary image.
   */
  const getImageDetails = useCallback(async (imageId) => {
    setLoading(true);
    setError(null);

    try {
      const fields = 'id,geometry,compass_angle,captured_at,is_pano,thumb_2048_url,sequence,width,height';
      const url = `${MAPILLARY_GRAPH_API}/${imageId}?access_token=${ACCESS_TOKEN}&fields=${fields}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Mapillary API error: ${response.status}`);

      const data = await response.json();
      setLoading(false);

      return {
        id: data.id,
        lat: data.geometry?.coordinates?.[1],
        lng: data.geometry?.coordinates?.[0],
        heading: data.compass_angle,
        capturedAt: data.captured_at,
        isPano: data.is_pano,
        thumbUrl: data.thumb_2048_url,
        sequenceId: data.sequence,
        width: data.width,
        height: data.height,
      };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return null;
    }
  }, []);

  return {
    searchNearby,
    getImageDetails,
    loading,
    error,
    accessToken: ACCESS_TOKEN,
  };
}
