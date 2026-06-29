import { create } from "zustand";
import { profileBrandingApi, PublicBrandingOut } from "../api/profileBranding";

interface BrandingState {
  branding: PublicBrandingOut | null;
  loading: boolean;
  loadBranding: () => Promise<void>;
}

export const useBranding = create<BrandingState>((set) => ({
  branding: null,
  loading: true,
  async loadBranding() {
    try {
      const data = await profileBrandingApi.getPublicBranding();
      set({ branding: data, loading: false });
      
      if (data.app_name) {
        document.title = data.app_name;
      }
    } catch (e) {
      console.warn("Failed to load branding, using fallbacks:", e);
      set({
        branding: {
          app_name: "Верифика",
          topbar_logo_url: null,
          institution_logo_url: "/collegelogo.jpg",
          institution_logo_enabled: true,
          institution_logo_display_size_px: 56,
          login_banner_url: null,
          login_banner_enabled: false,
          updated_at: new Date().toISOString(),
        },
        loading: false,
      });
    }
  },
}));
