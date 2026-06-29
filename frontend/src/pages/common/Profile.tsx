import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LogOut,
  User,
  ShieldCheck,
  Key,
  Laptop,
  Globe,
  MapPin,
  Clock,
  Trash2,
  Check,
  Upload,
  Layers,
  Calendar,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { api, errorMessage } from "../../api/client";
import { AppShell } from "../../components/AppShell";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Field, PasswordInput } from "../../components/ui/Field";
import { EmptyState, Skeleton } from "../../components/ui/Feedback";
import { useToasts } from "../../components/ui/Toast";
import { useAuth } from "../../store/auth";
import { profileBrandingApi, AuthSessionOut, UserAvatarOut } from "../../api/profileBranding";
import { ProtectedImage } from "../../components/ProtectedImage";

export default function Profile() {
  const { user, logout } = useAuth();
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();

  // Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [logoutOthers, setLogoutOthers] = useState(true);

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [editLogin, setEditLogin] = useState("");

  // Avatar Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, width: 256, height: 256 });
  const [isUploading, setIsUploading] = useState(false);

  // Modal / Confirm States
  const [sessionToRevoke, setSessionToRevoke] = useState<AuthSessionOut | null>(null);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  // Queries
  const { data: profileData, isLoading: isProfileLoading } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => profileBrandingApi.getProfileMe(),
  });

  const { data: avatarsData, refetch: refetchAvatars } = useQuery({
    queryKey: ["profile", "avatars"],
    queryFn: () => profileBrandingApi.getAvatars(),
  });

  const { data: sessionsData, refetch: refetchSessions } = useQuery({
    queryKey: ["profile", "sessions"],
    queryFn: () => profileBrandingApi.getSessions(),
  });

  useEffect(() => {
    if (profileData?.user) {
      setEditEmail(profileData.user.email || "");
      setEditLogin(profileData.user.login || "");
    }
  }, [profileData]);

  // Mutations
  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const res = await profileBrandingApi.updateProfileMe({
        email: editEmail,
        login: editLogin,
      });
      return res;
    },
    onSuccess: (data) => {
      pushToast("success", "Профиль успешно обновлён");
      setIsEditingProfile(false);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      // Update global auth store user object
      if (user) {
        useAuth.setState({ user: { ...user, email: data.user.email, login: data.user.login } });
      }
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });
  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      const endpoint = user?.role === "teacher" ? "/api/teacher/change-password" : "/api/v2/auth/change-password";
      await api.post(endpoint, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      if (logoutOthers) {
        await profileBrandingApi.revokeAllSessions(false);
      }
    },
    onSuccess: () => {
      pushToast("success", "Пароль успешно изменён");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const activateAvatarMutation = useMutation({
    mutationFn: (avatarId: number) => profileBrandingApi.activateAvatar(avatarId),
    onSuccess: (avatar) => {
      pushToast("success", "Аватар изменён");
      refetchAvatars();
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      // Update global auth store user object
      if (user) {
        useAuth.setState({ user: { ...user, avatar_url: avatar.url } });
      }
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const deleteAvatarMutation = useMutation({
    mutationFn: (avatarId: number) => profileBrandingApi.deleteAvatar(avatarId),
    onSuccess: () => {
      pushToast("success", "Аватар удалён");
      refetchAvatars();
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      profileBrandingApi.getProfileMe().then((profile) => {
        if (user) {
          useAuth.setState({ user: { ...user, avatar_url: profile.user.avatar_url } });
        }
      }).catch(() => {
        if (user) {
          useAuth.setState({ user: { ...user, avatar_url: null } });
        }
      });
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (sid: string) => profileBrandingApi.revokeSession(sid),
    onSuccess: () => {
      pushToast("success", "Сеанс завершён");
      refetchSessions();
      setSessionToRevoke(null);
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  const revokeAllSessionsMutation = useMutation({
    mutationFn: (includeCurrent: boolean) => profileBrandingApi.revokeAllSessions(includeCurrent),
    onSuccess: () => {
      pushToast("success", "Все другие сеансы завершены");
      refetchSessions();
      setConfirmRevokeAll(false);
    },
    onError: (e) => pushToast("error", errorMessage(e)),
  });

  // Handle image selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        pushToast("error", "Пожалуйста, выберите изображение JPEG, PNG или WebP");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        pushToast("error", "Размер файла не должен превышать 5 МБ");
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  // Perform upload with client-side crop coordinates
  const handleUploadAvatar = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    try {
      const cropJson = JSON.stringify({
        x: cropBox.x,
        y: cropBox.y,
        width: cropBox.width,
        height: cropBox.height,
      });
      const avatar = await profileBrandingApi.uploadAvatar(selectedFile, cropJson);
      pushToast("success", "Новый аватар успешно загружен");
      setSelectedFile(null);
      setPreviewUrl(null);
      refetchAvatars();
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      if (user) {
        useAuth.setState({ user: { ...user, avatar_url: avatar.url } });
      }
    } catch (e) {
      pushToast("error", errorMessage(e));
    } finally {
      setIsUploading(false);
    }
  };

  const handlePasswordSubmit = () => {
    if (newPassword !== confirmPassword) {
      pushToast("error", "Пароли не совпадают");
      return;
    }
    if (newPassword.length < 8 || !/[A-ZА-Я]/.test(newPassword) || !/\d/.test(newPassword)) {
      pushToast("error", "Новый пароль должен содержать минимум 8 символов, заглавную букву и цифру");
      return;
    }
    changePasswordMutation.mutate();
  };

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .slice(0, 2)
        .map((x) => x[0])
        .join("")
        .toUpperCase()
    : "У";

  return (
    <AppShell>
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[var(--color-border)] pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Профиль</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Управление вашей учетной записью, аватаром и активными сеансами.
            </p>
          </div>
          <Button variant="danger" iconLeft={<LogOut className="w-4 h-4" />} onClick={logout}>
            Выйти из аккаунта
          </Button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* LEFT COLUMN: Avatar & Profile Details */}
          <div className="space-y-6">
            {/* Avatar Card */}
            <Card className="overflow-hidden">
              <h3 className="text-base font-semibold mb-4">Фото профиля</h3>
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                <div className="relative group">
                  {user?.avatar_url ? (
                    <ProtectedImage
                      src={user.avatar_url}
                      alt="Avatar"
                      className="w-24 h-24 rounded-full object-cover ring-4 ring-[var(--color-accent)]/20"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] grid place-items-center text-3xl font-semibold ring-4 ring-[var(--color-accent)]/20">
                      {initials}
                    </div>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/50 text-white rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs cursor-pointer"
                  >
                    <Upload className="w-4 h-4 mb-1" />
                    Изменить
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp"
                  />
                </div>

                <div className="flex-1 text-center sm:text-left space-y-2">
                  <h4 className="font-medium text-sm">Загрузить новое изображение</h4>
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    Поддерживаются форматы JPG, PNG или WebP. Максимальный размер файла — 5 МБ. Изображение будет автоматически обрезано в квадрат 256x256 пикселей.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<Upload className="w-3.5 h-3.5" />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Выбрать файл
                  </Button>
                </div>
              </div>

              {/* Crop Preview & Upload Button */}
              {previewUrl && (
                <div className="mt-5 border-t border-[var(--color-border)] pt-4 space-y-4">
                  <div className="text-sm font-medium">Предпросмотр нового аватара</div>
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative overflow-hidden w-48 h-48 border-2 border-[var(--color-border)] rounded-lg">
                      <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex gap-2 w-full">
                      <Button
                        className="flex-1"
                        loading={isUploading}
                        onClick={handleUploadAvatar}
                      >
                        Сохранить аватар
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={isUploading}
                        onClick={() => {
                          setSelectedFile(null);
                          setPreviewUrl(null);
                        }}
                      >
                        Отмена
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Avatar History (Last 12) */}
              {avatarsData && avatarsData.items.length > 1 && (
                <div className="mt-6 border-t border-[var(--color-border)] pt-5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
                    Предыдущие аватары
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {avatarsData.items.map((av) => (
                      <div
                        key={av.avatar_id}
                        className={`relative group w-12 h-12 rounded-full overflow-hidden border-2 cursor-pointer transition-all ${
                          av.is_active
                            ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20"
                            : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]"
                        }`}
                      >
                        <ProtectedImage
                          src={av.url}
                          alt="Historical Avatar"
                          className="w-full h-full object-cover"
                          onClick={() => {
                            if (!av.is_active) {
                              activateAvatarMutation.mutate(av.avatar_id);
                            }
                          }}
                        />
                        {!av.is_active && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Вы действительно хотите удалить этот аватар?")) {
                                deleteAvatarMutation.mutate(av.avatar_id);
                              }
                            }}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow hover:bg-red-600"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                        {av.is_active && (
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white">
                            <Check className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Profile Details Card */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold">Данные пользователя</h3>
                {!isEditingProfile && !isProfileLoading && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsEditingProfile(true)}
                  >
                    Изменить
                  </Button>
                )}
              </div>
              {isProfileLoading ? (
                <Skeleton className="h-40" />
              ) : isEditingProfile ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-sm text-[var(--color-text-muted)]">ФИО</span>
                    <span className="text-sm font-medium col-span-2">{user?.full_name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-sm text-[var(--color-text-muted)]">Эл. почта</span>
                    <div className="col-span-2">
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-sm text-[var(--color-text-muted)]">Логин</span>
                    <div className="col-span-2">
                      <input
                        type="text"
                        value={editLogin}
                        onChange={(e) => setEditLogin(e.target.value)}
                        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-sm text-[var(--color-text-muted)]">Роль</span>
                    <span className="text-sm font-medium col-span-2">
                      <Badge tone={user?.role === "admin" ? "danger" : user?.role === "teacher" ? "accent" : "neutral"}>
                        {user?.role === "admin" ? "Администратор" : user?.role === "teacher" ? "Преподаватель" : "Студент"}
                      </Badge>
                    </span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      loading={updateProfileMutation.isPending}
                      onClick={() => updateProfileMutation.mutate()}
                    >
                      Сохранить
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={updateProfileMutation.isPending}
                      onClick={() => {
                        setIsEditingProfile(false);
                        if (profileData?.user) {
                          setEditEmail(profileData.user.email || "");
                          setEditLogin(profileData.user.login || "");
                        }
                      }}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2 border-b border-[var(--color-border)] pb-2">
                    <span className="text-sm text-[var(--color-text-muted)]">ФИО</span>
                    <span className="text-sm font-medium col-span-2">{user?.full_name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-[var(--color-border)] pb-2">
                    <span className="text-sm text-[var(--color-text-muted)]">Эл. почта</span>
                    <span className="text-sm font-medium col-span-2">{user?.email}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-b border-[var(--color-border)] pb-2">
                    <span className="text-sm text-[var(--color-text-muted)]">Логин</span>
                    <span className="text-sm font-medium col-span-2">{user?.login || "—"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pb-1">
                    <span className="text-sm text-[var(--color-text-muted)]">Роль</span>
                    <span className="text-sm font-medium col-span-2">
                      <Badge tone={user?.role === "admin" ? "danger" : user?.role === "teacher" ? "accent" : "neutral"}>
                        {user?.role === "admin" ? "Администратор" : user?.role === "teacher" ? "Преподаватель" : "Студент"}
                      </Badge>
                    </span>
                  </div>

                  {/* Role Specific Details */}
                  {profileData?.role_details && Object.keys(profileData.role_details).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[var(--color-border)] bg-[var(--color-bg-muted)]/40 p-3 rounded-lg space-y-2">
                      {profileData.role_details.department && (
                        <div className="flex justify-between text-sm">
                          <span className="text-[var(--color-text-muted)]">Кафедра:</span>
                          <span className="font-medium">{profileData.role_details.department}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* RIGHT COLUMN: Password & Sessions */}
          <div className="space-y-6">
            {/* Change Password Card */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Key className="w-5 h-5 text-[var(--color-accent)]" />
                <h3 className="text-base font-semibold">Безопасность и пароль</h3>
              </div>
              <div className="space-y-4">
                <Field label="Текущий пароль">
                  <PasswordInput
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </Field>
                <Field label="Новый пароль">
                  <PasswordInput
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </Field>
                <Field label="Подтверждение пароля">
                  <PasswordInput
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </Field>
                
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none py-1">
                  <input
                    type="checkbox"
                    checked={logoutOthers}
                    onChange={(e) => setLogoutOthers(e.target.checked)}
                    className="rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span>Выйти из аккаунта на других устройствах после смены</span>
                </label>

                <Button
                  loading={changePasswordMutation.isPending}
                  onClick={handlePasswordSubmit}
                  className="w-full sm:w-auto"
                >
                  Обновить пароль
                </Button>
              </div>
            </Card>

            {/* Devices and Sessions Card */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Laptop className="w-5 h-5 text-[var(--color-accent)]" />
                  <h3 className="text-base font-semibold">Активные сеансы</h3>
                </div>
                {sessionsData && sessionsData.items.length > 1 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmRevokeAll(true)}
                  >
                    Завершить все другие
                  </Button>
                )}
              </div>

              {!sessionsData ? (
                <Skeleton className="h-40" />
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {sessionsData.items.map((sess) => (
                    <div key={sess.auth_session_id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-1 p-2 rounded-lg bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]">
                            <Laptop className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">
                                {sess.device_name || sess.browser_name || "Неизвестное устройство"}
                              </span>
                              {sess.is_current && (
                                <Badge tone="accent">Этот сеанс</Badge>
                              )}
                              <Badge tone="neutral" className="capitalize">
                                {sess.client_kind}
                              </Badge>
                            </div>
                            
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
                              <span className="flex items-center gap-1">
                                <Globe className="w-3.5 h-3.5" />
                                {sess.ip_addr_masked}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" />
                                {sess.location_label}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                Активен: {new Date(sess.last_seen_at).toLocaleDateString()} в {new Date(sess.last_seen_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                        </div>

                        {!sess.is_current && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSessionToRevoke(sess)}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50/50"
                          >
                            Завершить
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Modal: Confirm Revoke Single Session */}
        {sessionToRevoke && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 text-red-500 mb-3">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-lg font-semibold">Завершить сеанс?</h3>
              </div>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-5">
                Вы собираетесь принудительно завершить сеанс на устройстве{" "}
                <strong className="text-[var(--color-text)]">
                  {sessionToRevoke.device_name || sessionToRevoke.browser_name || "Неизвестное устройство"}
                </strong>{" "}
                ({sessionToRevoke.ip_addr_masked}). Пользователю потребуется заново войти в систему.
              </p>
              <div className="flex justify-end gap-2.5">
                <Button variant="secondary" onClick={() => setSessionToRevoke(null)}>
                  Отмена
                </Button>
                <Button
                  variant="danger"
                  loading={revokeSessionMutation.isPending}
                  onClick={() => revokeSessionMutation.mutate(sessionToRevoke.auth_session_id)}
                >
                  Да, завершить
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Modal: Confirm Revoke All Other Sessions */}
        {confirmRevokeAll && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 text-red-500 mb-3">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-lg font-semibold">Завершить все другие сеансы?</h3>
              </div>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-5">
                Это действие принудительно завершит все активные входы в ваш аккаунт на всех других устройствах и браузерах. Текущий сеанс останется активным.
              </p>
              <div className="flex justify-end gap-2.5">
                <Button variant="secondary" onClick={() => setConfirmRevokeAll(false)}>
                  Отмена
                </Button>
                <Button
                  variant="danger"
                  loading={revokeAllSessionsMutation.isPending}
                  onClick={() => revokeAllSessionsMutation.mutate(false)}
                >
                  Да, завершить все
                </Button>
              </div>
            </Card>
          </div>
        )}
      </section>
    </AppShell>
  );
}
