import { useState, useCallback } from "react";

export interface GPSCoordinates {
  lat: number;
  lng: number;
  accuracy: number | null;
  // ISO timestamp from device — captured at moment of call, not at upload.
  // FR-MR-05.24: device timestamp, never server-generated.
  capturedAt: string;
}

interface GPSState {
  coordinates: GPSCoordinates | null;
  error: string | null;
  loading: boolean;
}

export function useGPS() {
  const [state, setState] = useState<GPSState>({
    coordinates: null,
    error: null,
    loading: false,
  });

  const capture = useCallback((): Promise<GPSCoordinates> => {
    setState(s => ({ ...s, loading: true, error: null }));

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const err = "Geolocation not available on this device";
        setState({ coordinates: null, error: err, loading: false });
        reject(new Error(err));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: GPSCoordinates = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            capturedAt: new Date(pos.timestamp).toISOString(),
          };
          setState({ coordinates: coords, error: null, loading: false });
          resolve(coords);
        },
        (err) => {
          const msg = `GPS unavailable: ${err.message}`;
          // GPS failure is non-blocking — evidence is still valid without it.
          // The upload will use 0,0 as fallback; caller decides.
          setState({ coordinates: null, error: msg, loading: false });
          reject(new Error(msg));
        },
        {
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 0, // Always fresh — never use cached for evidence
        },
      );
    });
  }, []);

  return { ...state, capture };
}
