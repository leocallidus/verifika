import { Link } from "react-router-dom";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] grid place-items-center px-4">
      <div className="text-center max-w-sm">
        <div className="text-6xl font-bold tracking-tight text-[var(--color-text-primary)]">404</div>
        <p className="text-[var(--color-text-muted)] mt-2 mb-5">Страница не найдена</p>
        <Link to="/" className="btn btn-primary inline-flex">
          <Home className="w-4 h-4" /> На главную
        </Link>
      </div>
    </div>
  );
}
