import { useEffect, useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { api } from "../api/client";
import { cn } from "../lib/cn";

type ProtectedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  alt: string;
};

export function ProtectedImage({
  src,
  alt,
  className,
  ...imgProps
}: ProtectedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setObjectUrl(null);
      setFailed(false);
      return;
    }
    let alive = true;
    let nextUrl: string | null = null;
    setFailed(false);
    api
      .get(src, { responseType: "blob" })
      .then((r) => {
        if (!alive) return;
        nextUrl = URL.createObjectURL(r.data);
        setObjectUrl(nextUrl);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [src]);

  if (!src || failed) return null;
  if (!objectUrl) {
    return <div className={cn("animate-pulse bg-[var(--color-bg-muted)]", className)} />;
  }
  return <img src={objectUrl} alt={alt} className={className} loading="lazy" {...imgProps} />;
}
