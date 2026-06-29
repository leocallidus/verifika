import { API_URL } from "../api/client";

export function mediaUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }
  if (url === "/collegelogo.jpg") {
    return url;
  }
  return `${API_URL.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}
