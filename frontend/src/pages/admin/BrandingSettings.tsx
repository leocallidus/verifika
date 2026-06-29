import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Palette, Upload, RefreshCw, Eye, Save, Trash2, Check, Image as ImageIcon } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Field";
import { useToasts } from "../../components/ui/Toast";
import { Skeleton } from "../../components/ui/Feedback";
import { errorMessage } from "../../api/client";
import { profileBrandingApi, AdminBrandingOut } from "../../api/profileBranding";
import { mediaUrl } from "../../lib/media-url";
import { useBranding } from "../../store/branding";

export default function BrandingSettings() {
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const { loadBranding } = useBranding();

  // Settings State (Applied on Save)
  const [appName, setAppName] = useState("Верифика");
  const [logoSize, setLogoSize] = useState(56);
  const [institutionLogoEnabled, setInstitutionLogoEnabled] = useState(true);
  const [bannerEnabled, setBannerEnabled] = useState(false);
  const [topbarLogoId, setTopbarLogoId] = useState<number | null>(null);
  const [institutionLogoId, setInstitutionLogoId] = useState<number | null>(null);
  const [loginBannerId, setLoginBannerId] = useState<number | null>(null);

  // Queries
  const { data: brandingData, isLoading, refetch } = useQuery<AdminBrandingOut>({
    queryKey: ["admin", "branding"],
    queryFn: () => profileBrandingApi.getAdminBranding(),
  });

  // Sync state with loaded data
  useEffect(() => {
    if (brandingData) {
      setAppName(brandingData.app_name);
      setLogoSize(brandingData.institution_logo_display_size_px);
      setInstitutionLogoEnabled(brandingData.institution_logo_enabled);
      setBannerEnabled(brandingData.login_banner_enabled);
      setTopbarLogoId(brandingData.topbar_logo_asset_id ?? null);
      setInstitutionLogoId(brandingData.institution_logo_asset_id ?? null);
      setLoginBannerId(brandingData.login_banner_asset_id ?? null);
    }
  }, [brandingData]);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: () =>
      profileBrandingApi.updateAdminBranding({
        app_name: appName,
        institution_logo_display_size_px: logoSize,
        institution_logo_enabled: institutionLogoEnabled,
        login_banner_enabled: bannerEnabled,
        topbar_logo_asset_id: topbarLogoId,
        institution_logo_asset_id: institutionLogoId,
        login_banner_asset_id: loginBannerId,
      }),
    onSuccess: () => {
      pushToast("success", "Настройки брендирования успешно сохранены");
      refetch();
      loadBranding(); // Update global branding
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const uploadAssetMutation = useMutation({
    mutationFn: ({ kind, file }: { kind: string; file: File }) =>
      profileBrandingApi.uploadBrandingAsset(kind, file),
    onSuccess: (data) => {
      pushToast("success", "Файл успешно загружен");
      refetch();
      // Auto-select the newly uploaded asset
      if (data.asset_kind === "topbar_logo") setTopbarLogoId(data.asset_id);
      if (data.asset_kind === "institution_logo") setInstitutionLogoId(data.asset_id);
      if (data.asset_kind === "login_banner") setLoginBannerId(data.asset_id);
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const deleteAssetMutation = useMutation({
    mutationFn: (assetId: number) => profileBrandingApi.deleteBrandingAsset(assetId),
    onSuccess: () => {
      pushToast("success", "Ассет удалён");
      refetch();
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const handleFileUpload = (kind: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadAssetMutation.mutate({ kind, file });
    }
  };

  const handleResetToDefault = () => {
    if (confirm("Вы действительно хотите сбросить все настройки брендирования к значениям по умолчанию?")) {
      setAppName("Верифика");
      setLogoSize(56);
      setInstitutionLogoEnabled(true);
      setBannerEnabled(false);
      setTopbarLogoId(null);
      setInstitutionLogoId(null);
      setLoginBannerId(null);
      saveMutation.mutate();
    }
  };

  // Find preview URLs for selected assets
  const getAssetUrl = (kind: string, id: number | null) => {
    if (!id) return null;
    // Check in recent assets first
    const list = brandingData?.recent_assets[kind] || [];
    const found = list.find((a) => a.asset_id === id);
    return found ? found.url : mediaUrl(`/api/v2/profile-branding/public/branding-assets/${id}`);
  };

  const topbarLogoUrl = getAssetUrl("topbar_logo", topbarLogoId);
  const instLogoUrl = getAssetUrl("institution_logo", institutionLogoId) || mediaUrl("/collegelogo.jpg");
  const bannerUrl = getAssetUrl("login_banner", loginBannerId);

  if (isLoading || !brandingData) {
    return (
      <AppShell>
        <div className="max-w-5xl mx-auto px-4 py-8">
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--color-border)] pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Брендирование</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Настройка внешнего вида приложения, логотипов учреждения и баннеров входа.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              iconLeft={<RefreshCw className="w-4 h-4" />}
              onClick={handleResetToDefault}
            >
              Сбросить
            </Button>
            <Button
              variant="primary"
              iconLeft={<Save className="w-4 h-4" />}
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Сохранить
            </Button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* LEFT: Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* General Settings */}
            <Card>
              <h3 className="text-base font-semibold mb-4">Основные настройки</h3>
              <div className="space-y-4">
                <Field label="Название приложения" required>
                  <Input
                    type="text"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder="Например: СТС ГПОУ КПК"
                  />
                </Field>

                <div className="space-y-2">
                  <label className="block text-sm font-medium">Размер логотипа учреждения (px)</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="40"
                      max="96"
                      value={logoSize}
                      onChange={(e) => setLogoSize(parseInt(e.target.value))}
                      className="w-full accent-[var(--color-accent)] cursor-pointer"
                    />
                    <span className="text-sm font-semibold tabular-nums w-8 text-right">{logoSize}px</span>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer select-none py-1">
                  <input
                    type="checkbox"
                    checked={institutionLogoEnabled}
                    onChange={(e) => setInstitutionLogoEnabled(e.target.checked)}
                    className="rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="font-medium">Показывать логотип учреждения в нижнем правом углу экрана входа</span>
                </label>

                <label className="flex items-center gap-2 text-sm cursor-pointer select-none py-1">
                  <input
                    type="checkbox"
                    checked={bannerEnabled}
                    onChange={(e) => setBannerEnabled(e.target.checked)}
                    className="rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="font-medium">Включить рекламный/информационный баннер на экране входа</span>
                </label>
              </div>
            </Card>

            {/* Asset Uploads */}
            {(["topbar_logo", "institution_logo", "login_banner"] as const).map((kind) => {
              const label =
                kind === "topbar_logo"
                  ? "Логотип верхнего бара"
                  : kind === "institution_logo"
                    ? "Логотип учреждения (экран входа)"
                    : "Баннер экрана входа";

              const desc =
                kind === "topbar_logo"
                  ? "Рекомендуется прозрачный PNG высотой до 48px."
                  : kind === "institution_logo"
                    ? "Квадратный или круглый логотип. Авто-размер."
                    : "Широкоформатный баннер (минимум 800x240px).";

              const currentId =
                kind === "topbar_logo"
                  ? topbarLogoId
                  : kind === "institution_logo"
                    ? institutionLogoId
                    : loginBannerId;

              const setAssetId =
                kind === "topbar_logo"
                  ? setTopbarLogoId
                  : kind === "institution_logo"
                    ? setInstitutionLogoId
                    : setLoginBannerId;

              const recent = brandingData.recent_assets[kind] || [];

              return (
                <Card key={kind} className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">{label}</h3>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{desc}</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="btn btn-neutral text-xs cursor-pointer inline-flex items-center gap-2 shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      Загрузить файл
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => handleFileUpload(kind, e)}
                        className="hidden"
                      />
                    </label>

                    {currentId && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => setAssetId(null)}
                      >
                        Сбросить
                      </Button>
                    )}
                  </div>

                  {/* History List */}
                  {recent.length > 0 && (
                    <div className="pt-2">
                      <div className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                        Недавно загруженные ассеты
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {recent.map((asset) => {
                          const isSelected = currentId === asset.asset_id;
                          return (
                            <div
                              key={asset.asset_id}
                              onClick={() => setAssetId(asset.asset_id)}
                              className={`relative group w-12 h-12 rounded-md overflow-hidden border-2 cursor-pointer transition-all ${
                                isSelected
                                  ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20"
                                  : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]"
                              }`}
                            >
                              <img
                                src={asset.url}
                                alt={asset.original_name}
                                className="w-full h-full object-cover"
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("Вы действительно хотите окончательно удалить этот ассет?")) {
                                    deleteAssetMutation.mutate(asset.asset_id);
                                    if (isSelected) setAssetId(null);
                                  }
                                }}
                                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                              {isSelected && (
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white">
                                  <Check className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* RIGHT: Live Previews (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Eye className="w-4 h-4 text-[var(--color-accent)]" />
              Предпросмотр
            </h3>

            {/* Topbar Preview */}
            <Card className="p-0 overflow-hidden">
              <div className="p-3 border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Верхний бар (Topbar)
              </div>
              <div className="bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] h-12 px-4 flex items-center gap-2">
                {topbarLogoUrl ? (
                  <img src={topbarLogoUrl} className="h-6 object-contain" alt="Topbar Logo" />
                ) : (
                  <div className="w-5 h-5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)] grid place-items-center">
                    <span className="text-[10px] font-bold">V</span>
                  </div>
                )}
                <span className="font-semibold text-sm truncate max-w-[150px]">{appName}</span>
                <div className="flex-1" />
                <div className="w-6 h-6 rounded-full bg-[var(--color-bg-muted)]" />
              </div>
            </Card>

            {/* Login Preview */}
            <Card className="p-0 overflow-hidden">
              <div className="p-3 border-b border-[var(--color-border)] bg-[var(--color-bg-muted)] text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Экран входа (Login Screen)
              </div>
              <div className="relative bg-[var(--color-bg)] p-6 flex flex-col items-center">
                <div
                  className={`w-full max-w-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-elevated)] shadow-sm overflow-hidden`}
                >
                  {bannerEnabled && bannerUrl && (
                    <div className="relative h-20 overflow-hidden">
                      <img src={bannerUrl} className="w-full h-full object-cover" alt="Banner" />
                      <div className="absolute inset-0 bg-black/50 flex items-center p-3 text-white text-xs font-bold">
                        {appName}
                      </div>
                    </div>
                  )}
                  <div className="p-4 flex flex-col items-center text-center">
                    {institutionLogoId ? (
                      <img
                        src={instLogoUrl ?? undefined}
                        style={{ height: `${logoSize / 2}px` }}
                        className="object-contain mb-2"
                        alt="Logo"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] grid place-items-center mb-2">
                        <span className="text-xs font-bold">🎓</span>
                      </div>
                    )}
                    <div className="text-xs font-bold">Войдите в систему</div>
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{appName}</div>
                    <div className="w-full mt-3 space-y-1.5">
                      <div className="h-6 rounded bg-[var(--color-bg-muted)] w-full" />
                      <div className="h-6 rounded bg-[var(--color-bg-muted)] w-full" />
                      <div className="h-6 rounded bg-[var(--color-accent)] w-full" />
                    </div>
                  </div>
                </div>
                {institutionLogoEnabled && (
                  <div
                    className="absolute bottom-2 right-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/85 p-1 shadow-sm"
                    title="Логотип в нижнем правом углу"
                  >
                    <img
                      src={instLogoUrl ?? undefined}
                      style={{ width: `${Math.max(24, logoSize / 2)}px`, height: `${Math.max(24, logoSize / 2)}px` }}
                      className="object-contain"
                      alt="Corner Logo"
                    />
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
