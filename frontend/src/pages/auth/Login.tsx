import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GraduationCap, LogIn } from "lucide-react";
import { useAuth, roleHome } from "../../store/auth";
import { errorMessage } from "../../api/client";
import { useToasts } from "../../components/ui/Toast";
import { Field, Input, PasswordInput } from "../../components/ui/Field";
import { Button } from "../../components/ui/Button";
import { AppShell } from "../../components/AppShell";

import { useBranding } from "../../store/branding";

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
const LOGIN_RE = /^[a-z0-9._-]{3,64}$/i;
const PASSWORD_MIN = 8;

function validateLocally(identifier: string, password: string): string | null {
  const id = identifier.trim();
  if (!id) return "Введите email или логин";

  const looksLikeEmail = id.includes("@");
  if (looksLikeEmail) {
    if (!EMAIL_RE.test(id)) {
      const [, domain] = id.split("@");
      if (!domain) return "Email должен содержать @";
      if (!domain.includes(".")) return "Email должен содержать домен (например, univ.ru)";
      return "Введите корректный email";
    }
  } else if (!LOGIN_RE.test(id)) {
    if (id.length < 3) return "Логин должен быть не короче 3 символов";
    if (/\s/.test(id)) return "Логин не должен содержать пробелов";
    return "Логин может содержать только латиницу, цифры, . _ -";
  }

  if (!password) return "Введите пароль";
  if (password.length < PASSWORD_MIN) {
    return `Пароль должен быть не менее ${PASSWORD_MIN} символов`;
  }
  return null;
}

function isEmail(s: string): boolean {
  return s.includes("@") && s.split("@")[1]?.includes(".");
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const user = useAuth((s) => s.user);
  const pushToast = useToasts((s) => s.push);
  const branding = useBranding((s) => s.branding);
  const appName = branding?.app_name || "Верифика";

  // Если у пользователя уже есть валидная сессия на момент попадания на /login
  // (например, после refresh страницы с действительным токеном), сразу отправим
  // его в соответствующий раздел — на странице входа делать нечего.
  useEffect(() => {
    if (user) {
      navigate(roleHome(user.role), { replace: true });
    }
  }, [user, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const trimmed = email.trim();
    const localErr = validateLocally(trimmed, password);
    if (localErr) {
      setErr(localErr);
      pushToast("error", localErr);
      return;
    }
    setSubmitting(true);
    try {
      const u = await login(isEmail(trimmed) ? trimmed.toLowerCase() : trimmed, password);
      navigate(roleHome(u.role));
    } catch (e) {
      const msg = errorMessage(e);
      setErr(msg);
      pushToast("error", msg);
    } finally {
      setSubmitting(false);
    }
  }

  const showBanner = branding?.login_banner_enabled && branding?.login_banner_url;

  return (
    <AppShell>
      <div className="min-h-[calc(100vh-3.5rem)] grid place-items-center px-4 py-12">
        <div
          className={`w-full ${
            showBanner ? "max-w-[420px] lg:max-w-4xl lg:grid lg:grid-cols-12" : "max-w-[420px]"
          } bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-xl shadow-sm overflow-hidden`}
        >
          {showBanner && (
            <div className="hidden lg:block lg:col-span-6 relative">
              <img
                src={branding.login_banner_url!}
                className="w-full h-full object-cover min-h-[460px]"
                alt="Login Banner"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent flex flex-col justify-end p-8 text-white">
                <h2 className="text-2xl font-bold">{appName}</h2>
                <p className="text-sm text-white/80 mt-1.5 leading-relaxed">
                  Единое пространство обучения, онлайн-тестирования и интеллектуального анализа результатов.
                </p>
              </div>
            </div>
          )}

          <form
            onSubmit={onSubmit}
            noValidate
            className={`p-7 ${showBanner ? "lg:col-span-6 flex flex-col justify-center" : ""}`}
          >
            <div className="flex flex-col items-center text-center mb-6">
              {branding?.institution_logo_url ? (
                <img
                  src={branding.institution_logo_url}
                  style={{ height: `${branding.institution_logo_display_size_px}px` }}
                  className="object-contain mb-3"
                  alt="Institution Logo"
                />
              ) : (
                <div className="grid place-items-center w-12 h-12 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] mb-3">
                  <GraduationCap className="w-6 h-6" strokeWidth={1.75} />
                </div>
              )}
              <h1 className="text-xl font-semibold tracking-tight">Войдите в систему</h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">{appName}</p>
            </div>

            <div className="space-y-3">
              <Field label="Email или логин" required hint={!err ? "Например: name@univ.ru или sidorov" : undefined}>
                <Input
                  type="text"
                  inputMode="email"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="name@univ.ru или sidorov"
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field
                label="Пароль"
                required
                hint={err ? undefined : `Не менее ${PASSWORD_MIN} символов`}
                error={err ?? undefined}
              >
                <PasswordInput
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  invalid={Boolean(err)}
                />
              </Field>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              className="w-full mt-5"
              iconLeft={!submitting ? <LogIn className="w-4 h-4" /> : undefined}
            >
              Войти
            </Button>

            <div className="text-center mt-4 space-y-1">
              <Link to="/reset" className="text-sm text-[var(--color-accent)] hover:underline block">
                Забыли пароль?
              </Link>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
