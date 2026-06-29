import { api } from "./client";
import { mediaUrl } from "../lib/media-url";

export interface PublicBrandingOut {
  app_name: string;
  topbar_logo_url: string | null;
  institution_logo_url: string;
  institution_logo_enabled: boolean;
  institution_logo_display_size_px: number;
  login_banner_url: string | null;
  login_banner_enabled: boolean;
  updated_at: string;
}

export interface UserProfileOut {
  id: number;
  role: string;
  full_name: string;
  email: string;
  login?: string;
  group_id?: number;
  avatar_url?: string;
}

export interface ProfileMeOut {
  user: UserProfileOut;
  role_details: Record<string, any>;
}

export interface UserAvatarOut {
  avatar_id: number;
  url: string;
  is_active: boolean;
  created_at: string;
}

export interface UserAvatarsListOut {
  items: UserAvatarOut[];
  limit: number;
}

export interface AuthSessionOut {
  auth_session_id: string;
  is_current: boolean;
  client_kind: string;
  device_name?: string;
  os_name?: string;
  os_version?: string;
  browser_name?: string;
  browser_version?: string;
  app_version?: string;
  location_label: string;
  ip_addr_masked: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
}

export interface AuthSessionsListOut {
  items: AuthSessionOut[];
}

export interface BrandingAssetOut {
  asset_id: number;
  asset_kind: string;
  url: string;
  content_type: string;
  size_bytes: number;
  width_px: number;
  height_px: number;
  display_width_px?: number;
  display_height_px?: number;
  original_name?: string;
  created_at: string;
}

export interface AdminBrandingOut {
  app_name: string;
  institution_logo_enabled: boolean;
  institution_logo_display_size_px: number;
  login_banner_enabled: boolean;
  topbar_logo_asset_id?: number;
  institution_logo_asset_id?: number;
  login_banner_asset_id?: number;
  active_assets: Record<string, BrandingAssetOut | null>;
  recent_assets: Record<string, BrandingAssetOut[]>;
}

export const profileBrandingApi = {
  getPublicBranding: () =>
    api.get<PublicBrandingOut>("/api/v2/profile-branding/public/branding").then((res) => normalizePublicBranding(res.data)),

  getProfileMe: () =>
    api.get<ProfileMeOut>("/api/v2/profile-branding/me").then((res) => normalizeProfile(res.data)),

  updateProfileMe: (patch: { login?: string; email?: string }) =>
    api.patch<ProfileMeOut>("/api/v2/profile-branding/me", patch).then((res) => normalizeProfile(res.data)),

  getAvatars: () =>
    api.get<UserAvatarsListOut>("/api/v2/profile-branding/avatars").then((res) => ({
      ...res.data,
      items: res.data.items.map(normalizeAvatar),
    })),

  uploadAvatar: (file: File, cropJson?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (cropJson) {
      fd.append("crop_json", cropJson);
    }
    return api.post<UserAvatarOut>("/api/v2/profile-branding/avatars", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((res) => normalizeAvatar(res.data));
  },

  activateAvatar: (avatarId: number) =>
    api.post<UserAvatarOut>(`/api/v2/profile-branding/avatars/${avatarId}/activate`).then((res) => normalizeAvatar(res.data)),

  deleteAvatar: (avatarId: number) =>
    api.delete(`/api/v2/profile-branding/avatars/${avatarId}`),

  getSessions: () =>
    api.get<AuthSessionsListOut>("/api/v2/profile-branding/sessions").then((res) => res.data),

  revokeSession: (sessionId: string) =>
    api.delete(`/api/v2/profile-branding/sessions/${sessionId}`),

  revokeAllSessions: (includeCurrent = false) =>
    api.delete<{ revoked_count: number; current_revoked: boolean }>(
      `/api/v2/profile-branding/sessions?include_current=${includeCurrent}`
    ).then((res) => res.data),

  getAdminBranding: () =>
    api.get<AdminBrandingOut>("/api/v2/profile-branding/admin/branding").then((res) => normalizeAdminBranding(res.data)),

  updateAdminBranding: (settings: Partial<PublicBrandingOut & {
    topbar_logo_asset_id: number | null;
    institution_logo_asset_id: number | null;
    login_banner_asset_id: number | null;
  }>) =>
    api.patch<PublicBrandingOut>("/api/v2/profile-branding/admin/branding", settings).then((res) => normalizePublicBranding(res.data)),

  uploadBrandingAsset: (kind: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<BrandingAssetOut>(`/api/v2/profile-branding/admin/branding/assets/${kind}`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((res) => normalizeAsset(res.data));
  },

  deleteBrandingAsset: (assetId: number) =>
    api.delete(`/api/v2/profile-branding/admin/branding/assets/${assetId}`),
};

function normalizePublicBranding(data: PublicBrandingOut): PublicBrandingOut {
  return {
    ...data,
    topbar_logo_url: mediaUrl(data.topbar_logo_url),
    institution_logo_url: mediaUrl(data.institution_logo_url) ?? "",
    institution_logo_enabled: data.institution_logo_enabled ?? true,
    login_banner_url: mediaUrl(data.login_banner_url),
  };
}

function normalizeProfile(data: ProfileMeOut): ProfileMeOut {
  return {
    ...data,
    user: {
      ...data.user,
      avatar_url: mediaUrl(data.user.avatar_url) ?? undefined,
    },
  };
}

function normalizeAvatar(data: UserAvatarOut): UserAvatarOut {
  return {
    ...data,
    url: mediaUrl(data.url) ?? data.url,
  };
}

function normalizeAsset(data: BrandingAssetOut): BrandingAssetOut {
  return {
    ...data,
    url: mediaUrl(data.url) ?? data.url,
  };
}

function normalizeAdminBranding(data: AdminBrandingOut): AdminBrandingOut {
  const active_assets = Object.fromEntries(
    Object.entries(data.active_assets).map(([kind, asset]) => [kind, asset ? normalizeAsset(asset) : null]),
  );
  const recent_assets = Object.fromEntries(
    Object.entries(data.recent_assets).map(([kind, assets]) => [kind, assets.map(normalizeAsset)]),
  );
  return {
    ...data,
    institution_logo_enabled: data.institution_logo_enabled ?? true,
    active_assets,
    recent_assets,
  };
}
