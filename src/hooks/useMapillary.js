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
      const url = `${MAPILLARY_GRAPH_API}/images?access_token=${ACCESS_TOKEN}&fields=${fields}&is_pano=true&bbox=${lng - 0.005},${lat - 0.005},${lng + 0.005},${lat + 0.005}&limit=50`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Mapillary API error: ${response.status}`);

      const data = await response.json();
      setLoading(false);

      return (data.data || []).map((img) => ({
        id: img.id,
        lat: img.geometry?.coordinates?.[1],
        lng: img.geometry?.coordinates?.[0],
        heading: img.compass_angle,
        capturedAt: img.captured_at,
        isPano: img.is_pano,
        thumbUrl: img.thumb_1024_url,
        sequenceId: img.sequence,
      }));
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
