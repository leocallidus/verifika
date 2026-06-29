import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { useToasts } from "../../components/ui/Toast";
import { Field, Input, PasswordInput } from "../../components/ui/Field";
import { Button } from "../../components/ui/Button";
import { AppShell } from "../../components/AppShell";

type Mode = "request" | "confirm";

export default function ResetRequest() {
  const [params] = useSearchParams();
  const mode: Mode = params.get("mode") === "confirm" && params.get("token") ? "confirm" : "request";
  const token = params.get("token") ?? "";

  if (mode === "confirm") return <ResetConfirm token={token} />;

  return <ResetRequestForm />;
}

function ResetRequestForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [delivery, setDelivery] = useState<string | null>(null);
  const pushToast = useToasts((s) => s.push);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await api.post("/api/v2/auth/reset/request", { email: email.trim().toLowerCase() });
      setDelivery(r.data.delivery);
      pushToast("success", "Ссылка отправлена");
    } catch (e) {
      pushToast("error", errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="min-h-[calc(100vh-3.5rem)] grid place-items-center px-4 py-12">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-[420px] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-xl shadow-sm p-7"
        >
          <div className="flex flex-col items-center text-center mb-6">
            <div className="grid place-items-center w-12 h-12 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] mb-3">
              <KeyRound className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Сброс пароля</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Отправим ссылку на email</p>
          </div>
          <Field label="Email" required>
            <Input
              type="email"
              autoFocus
              placeholder="name@univ.ru"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full mt-4">
            Отправить ссылку
          </Button>
          {delivery && (
            <div className="mt-4 p-3 rounded-md bg-[var(--color-success-bg)] text-[var(--color-success)] text-sm flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <div>Ссылка отправлена ({delivery}). В demo — `/tmp/sts-reset-fallback/`.</div>
            </div>
          )}
          <Link to="/login" className="block text-center mt-5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            На вход
          </Link>
        </form>
      </div>
    </AppShell>
  );
}

function ResetConfirm({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const pushToast = useToasts((s) => s.push);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) {
      setErr("Пароль слишком короткий (мин. 8 символов)");
      return;
    }
    if (pw !== pw2) {
      setErr("Пароли не совпадают");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/v2/auth/reset/confirm", { token, new_password: pw });
      setDone(true);
      pushToast("success", "Пароль обновлён");
      setTimeout(() => navigate("/login"), 1500);
    } catch (e) {
      setErr(errorMessage(e));
      pushToast("error", errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="min-h-[calc(100vh-3.5rem)] grid place-items-center px-4 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-[420px] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-xl shadow-sm p-7">
          <h1 className="text-xl font-semibold tracking-tight text-center mb-1">Новый пароль</h1>
          <p className="text-sm text-[var(--color-text-muted)] text-center mb-6">Введите новый пароль дважды.</p>
          <div className="space-y-3">
            <Field label="Новый пароль" required hint="Минимум 8 символов">
              <PasswordInput autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Field label="Повторите" required error={err ?? undefined}>
              <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} invalid={Boolean(err)} />
            </Field>
          </div>
          {err && (
            <p role="alert" className="mt-3 text-sm text-[var(--color-danger)] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{err}</span>
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" loading={submitting || done} className="w-full mt-5">
            Сохранить пароль
          </Button>
          <Link to="/reset" className="inline-flex items-center gap-1.5 mt-5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <ArrowLeft className="w-3.5 h-3.5" /> Назад
          </Link>
        </form>
      </div>
    </AppShell>
  );
}
