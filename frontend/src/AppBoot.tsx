import { useEffect } from "react";
import { useAuth } from "./store/auth";
import "./index.css";

export default function AppBoot({ children }: { children: React.ReactNode }) {
  const hydrate = useAuth((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return <>{children}</>;
}
