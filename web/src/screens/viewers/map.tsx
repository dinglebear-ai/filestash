"use client";

// Geo viewer (legacy application_map) — renders GeoJSON on a Leaflet map.
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function MapViewer({ src }: { src: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const map = L.map(el, { center: [0, 0], zoom: 2 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);

    let cancelled = false;
    fetch(src, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((geo) => {
        if (cancelled) return;
        const layer = L.geoJSON(geo).addTo(map);
        try {
          map.fitBounds(layer.getBounds(), { padding: [20, 20] });
        } catch {
          /* empty/degenerate geometry — keep default view */
        }
      })
      .catch(() => !cancelled && setError("Couldn't load this map data."));

    return () => {
      cancelled = true;
      map.remove();
    };
  }, [src]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[8px]" style={{ border: "1px solid var(--aurora-border-default)" }}>
      <div ref={elRef} className="h-full w-full" />
      {error ? (
        <p className="absolute inset-0 flex items-center justify-center aurora-text-body text-[var(--aurora-error)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
