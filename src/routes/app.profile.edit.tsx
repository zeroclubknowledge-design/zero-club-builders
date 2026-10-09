import { useNavigate, createFileRoute, useRouter } from "@tanstack/react-router";
import { Camera, X, Loader2 } from "@/components/icons/glyphs";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { uploadFile } from "@/lib/storage";
import { toast } from "sonner";
import { MediaCropper } from "@/components/MediaCropper";
import { useQueryClient } from "@tanstack/react-query";

import { useUser } from "@/hooks/useUser";
import { useGoBack } from "@/hooks/useGoBack";
import { AvatarMotionSettings } from "@/features/profile/AvatarMotionSettings";
import { requestAvatarMotion } from "@/features/profile/avatarMotionApi";
import { CertificatesEditor, ExperienceEditor, SocialLinksEditor } from "@/features/profile/CredentialsEditor";
import { normaliseSocialLink } from "@/features/profile/credentials";

export const Route = createFileRoute("/app/profile/edit")({
  component: EditProfile,
});

function EditProfile() {
  const { data: profile, isLoading: isProfileLoading } = useUser();
  const navigate = useNavigate();
  const goBack = useGoBack("/app/profile");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    full_name: "",
    bio: "",
    location: "",
    website: ""
  });
  // LinkedIn, GitHub, X… saved with the rest of the form.
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});
  const [avatar, setAvatar] = useState("");
  const [banner, setBanner] = useState("");
  const [draftProfileId, setDraftProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.id || draftProfileId === profile.id) return;

    const storedDraftKey = `zc:profile-draft:${profile.id}`;
    let nextFormData = {
      full_name: profile.full_name || "",
      bio: profile.bio || "",
      location: profile.location || "",
      website: profile.website || ""
    };

    try {
      const storedDraft = sessionStorage.getItem(storedDraftKey);
      if (storedDraft) {
        const parsedDraft = JSON.parse(storedDraft);
        nextFormData = {
          full_name: typeof parsedDraft.full_name === "string" ? parsedDraft.full_name : nextFormData.full_name,
          bio: typeof parsedDraft.bio === "string" ? parsedDraft.bio : nextFormData.bio,
          location: typeof parsedDraft.location === "string" ? parsedDraft.location : nextFormData.location,
          website: typeof parsedDraft.website === "string" ? parsedDraft.website : nextFormData.website,
        };
      }
    } catch {
      // Ignore malformed drafts and browsers that disable session storage.
    }

    setFormData(nextFormData);
    setSocialLinks((profile as { social_links?: Record<string, string> }).social_links || {});
    setAvatar(profile.avatar_url || "");
    setBanner(profile.banner_url || "");
    setDraftProfileId(profile.id);
  }, [profile, draftProfileId]);

  useEffect(() => {
    if (!profile?.id || draftProfileId !== profile.id) return;

    try {
      sessionStorage.setItem(`zc:profile-draft:${profile.id}`, JSON.stringify(formData));
    } catch {
      // Some private browsing modes disable session storage. The in-memory
      // form still works normally in that case.
    }
  }, [formData, profile?.id, draftProfileId]);

  // Arriving from "Add experience" / "Add certificate" on the profile: go straight there.
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (!hash || !profile?.id) return;
    const timer = window.setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    return () => window.clearTimeout(timer);
  }, [profile?.id]);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [cropImage, setCropImage] = useState<{ src: string, type: 'avatar' | 'banner' } | null>(null);

  const handleSave = async () => {
    try {
      setLoading(true);
      
      if (!profile?.id) {
        toast.error("User session not found. Please sign in again.");
        return;
      }

      // Update directly via Supabase client to bypass Vercel Server Function duplex error
      // Removing the cover only ever cleared it on screen: the form never sent
      // it, so the old picture came back on the next load.
      const coverRemoved = !banner && Boolean(profile.banner_url);
      // Handles become full links ("@ada" -> https://x.com/ada); empty ones are dropped.
      const social_links = Object.fromEntries(
        Object.entries(socialLinks)
          .map(([key, value]) => [key, normaliseSocialLink(key, value || "")])
          .filter(([, value]) => value),
      );
      const payload = { ...formData, social_links };
      const { error } = await supabase
        .from('profiles')
        .update(coverRemoved ? { ...payload, banner_url: null } : payload)
        .eq('id', profile.id);

      if (error) throw error;

      try {
        sessionStorage.removeItem(`zc:profile-draft:${profile.id}`);
      } catch {
        // Saving the profile succeeded; storage cleanup is best effort.
      }

      // Force React Query and TanStack Router to refetch the fresh profile data
      await queryClient.invalidateQueries({ queryKey: ["profile", "current"] });
      await router.invalidate();

      toast.success("Profile updated!");
      navigate({ to: "/app/profile" });
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error.message || "Update failed");
    } finally {
      setLoading(false);
    }
  };


  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    /* Animated profile pictures: a GIF goes up as it is. The cropper redraws
       images on a canvas, which keeps only the first frame and loses the
       animation, so it is skipped for GIFs. */
    if (type === 'avatar' && file.type === 'image/gif') {
      e.target.value = '';
      if (file.size > 8 * 1024 * 1024) {
        toast.error("Animated pictures can be up to 8 MB. Try a shorter or smaller GIF.");
        return;
      }
      void uploadProfileImage('avatar', file, 'gif');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropImage({ src: reader.result as string, type });
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!cropImage) return;
    const type = cropImage.type;
    setCropImage(null);
    // Extension follows the blob: the cropper emits WebP where the browser
    // can write it, and a .jpg holding WebP misleads anything that trusts
    // the suffix.
    await uploadProfileImage(type, croppedBlob, croppedBlob.type === 'image/webp' ? 'webp' : 'jpg');
  };

  const uploadProfileImage = async (type: 'avatar' | 'banner', croppedBlob: Blob, ext: string) => {
    try {
      setLoading(true);
      const fileName = `${type}-${profile.id}-${Date.now()}.${ext}`;
      const bucket = 'profiles';

      const file = new File([croppedBlob], fileName, { type: croppedBlob.type || 'image/jpeg' });
      const url = await uploadFile(bucket, file, `${profile.id}/${fileName}`);
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ [type === 'avatar' ? 'avatar_url' : 'banner_url']: url })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      if (type === 'avatar') setAvatar(url);
      // A new photo: start its animation in the background. The upload is
      // already done — nothing here waits on it, and a failure leaves the photo as is.
      if (type === 'avatar' && ext !== 'gif') {
        void requestAvatarMotion('auto')
          .catch(() => null)
          .finally(() => queryClient.invalidateQueries({ queryKey: ['avatar-motion-status'] }));
      }
      else setBanner(url);
      
      toast.success(ext === 'gif' ? 'Animated profile picture updated!' : `${type === 'avatar' ? 'Avatar' : 'Banner'} updated!`);
    } catch (error: any) {
      toast.error(error.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  if (isProfileLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas py-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initial = (profile?.full_name || profile?.username || 'A').charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-50 border-b border-border bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button
            onClick={goBack}
            aria-label="Close"
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
            disabled={loading}
          >
            <X className="h-[22px] w-[22px]" />
          </button>
          <h1 className="flex-1 font-display text-[18px] font-semibold">Edit profile</h1>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex h-9 items-center gap-2 rounded-full bg-foreground px-4 text-[15px] font-semibold text-background transition active:opacity-80 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </header>

      <main className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 md:py-2">
        <section className="bg-card pb-4 md:overflow-hidden md:rounded-xl md:border md:border-border">
          <div className="relative h-[110px] w-full overflow-hidden bg-[#221d22] sm:h-[150px]">
            {banner && <img src={banner} className="h-full w-full object-cover" alt="" loading="lazy" decoding="async" />}
            <div className="absolute right-3 top-3 flex gap-2">
              {banner && (
                <button
                  onClick={() => setBanner("")}
                  aria-label="Remove cover"
                  className="grid h-[30px] w-[30px] place-items-center rounded-full bg-black/55 text-white transition active:scale-95"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => bannerInputRef.current?.click()}
                disabled={loading}
                className="flex h-[30px] items-center gap-1.5 rounded-full bg-black/55 px-3 text-[12px] font-semibold text-white transition active:scale-95 disabled:opacity-50"
              >
                <Camera className="h-3.5 w-3.5" /> Change cover
              </button>
            </div>
            <input type="file" ref={bannerInputRef} className="hidden" accept="image/*" onChange={(e) => onFileChange(e, 'banner')} />
          </div>

          <div className="-mt-10 flex items-end gap-3 px-4">
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={loading}
              aria-label="Change profile photo"
              className="relative h-[84px] w-[84px] shrink-0 rounded-full border-4 border-card bg-card disabled:opacity-60"
            >
              <span className="block h-full w-full overflow-hidden rounded-full">
                {avatar ? (
                  <img src={avatar} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <span className="grid h-full w-full place-items-center bg-accent/10 font-display text-[26px] font-semibold text-accent">{initial}</span>
                )}
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full border-2 border-card bg-foreground text-background">
                <Camera className="h-3.5 w-3.5" />
              </span>
            </button>
            <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={(e) => onFileChange(e, 'avatar')} />
            <div className="min-w-0 pb-1">
              <button onClick={() => avatarInputRef.current?.click()} disabled={loading} className="text-[14px] font-semibold text-[#cc208f] hover:text-[#a3186f]">
                Edit photo
              </button>
              {profile?.username && <p className="truncate text-[13px] text-muted-foreground">@{profile.username}</p>}
            </div>
          </div>
          {profile?.id && (
            <div className="px-4 pt-3">
              <AvatarMotionSettings profileId={profile.id} enabled={profile.avatar_motion_enabled !== false} />
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4 bg-card px-4 pb-5 pt-4 md:rounded-xl md:border md:border-border">
          <h2 className="font-display text-[18px] font-semibold">About you</h2>
          <label className="block">
            <span className={LABEL}>Full name</span>
            <input
              value={formData.full_name}
              onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              className={FIELD}
              placeholder="Your full name"
              disabled={loading}
            />
          </label>
          <label className="block">
            <span className={LABEL}>Bio</span>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              rows={4}
              className={`${FIELD} h-auto resize-none py-2.5 leading-relaxed`}
              placeholder="What do you build? What are you learning?"
              disabled={loading}
            />
            <span className="mt-1 block text-[12px] text-muted-foreground">Shows under your name on your profile.</span>
          </label>
          <label className="block">
            <span className={LABEL}>Location</span>
            <input
              value={formData.location}
              onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
              className={FIELD}
              placeholder="City, country"
              disabled={loading}
            />
          </label>
          <label className="block">
            <span className={LABEL}>Website</span>
            <input
              value={formData.website}
              onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
              className={FIELD}
              placeholder="yourname.dev"
              inputMode="url"
              disabled={loading}
            />
          </label>
        </section>

        {/* Links are saved with the button at the top. Experience and
            certificates save on their own, one entry at a time. */}
        <SocialLinksEditor value={socialLinks} onChange={setSocialLinks} disabled={loading} />
        {profile?.id && <ExperienceEditor profileId={profile.id} />}
        {profile?.id && <CertificatesEditor profileId={profile.id} />}
        <div aria-hidden className="min-h-24 flex-1 bg-card md:hidden" />
      </main>

      {cropImage && (
        <MediaCropper
          src={cropImage.src}
          // Both are fixed shapes the layout depends on, so the presets stay
          // hidden here — offering 9:16 for an avatar would only be a way to
          // get it wrong.
          aspect={cropImage.type === 'avatar' ? 1 : 16 / 7}
          cropShape={cropImage.type === 'avatar' ? 'round' : 'rect'}
          title={cropImage.type === 'avatar' ? 'Profile photo' : 'Cover photo'}
          onDone={(result) => {
            if (result.kind === 'image') handleCropComplete(result.blob);
          }}
          onCancel={() => setCropImage(null)}
        />
      )}
    </div>
  );
}

const LABEL = "mb-1.5 block text-[13px] font-semibold text-muted-foreground";
const FIELD = "h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground/40 disabled:opacity-60";
