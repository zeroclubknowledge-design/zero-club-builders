import { useLoaderData, useNavigate, createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Camera, X, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { uploadFile } from "@/lib/storage";
import { updateProfileAction } from "@/api";
import { toast } from "sonner";
import { ImageCropper } from "@/components/ImageCropper";
import { useQueryClient } from "@tanstack/react-query";

import { useUser } from "@/hooks/useUser";

export const Route = createFileRoute("/app/profile/edit")({
  component: EditProfile,
});

function EditProfile() {
  const { data: profile, isLoading: isProfileLoading } = useUser();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  
  // Use useEffect to update formData when profile loads
  const [formData, setFormData] = useState({
    full_name: profile?.full_name || "",
    bio: profile?.bio || "",
    location: profile?.location || "",
    website: profile?.website || ""
  });
  const [avatar, setAvatar] = useState<string>(profile?.avatar_url || "");
  const [banner, setBanner] = useState<string>(profile?.banner_url || "");

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || "",
        bio: profile.bio || "",
        location: profile.location || "",
        website: profile.website || ""
      });
      setAvatar(profile.avatar_url || "");
      setBanner(profile.banner_url || "");
    }
  }, [profile]);

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
      const { error } = await supabase
        .from('profiles')
        .update(formData)
        .eq('id', profile.id);

      if (error) throw error;

      // Force React Query and TanStack Router to refetch the fresh profile data
      await queryClient.invalidateQueries({ queryKey: ['my_profile'] });
      await router.invalidate();

      toast.success("Profile updated!");
      navigate({ to: "/app/profile/" });
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

    try {
      setLoading(true);
      const fileName = `${type}-${profile.id}-${Date.now()}.jpg`;
      const bucket = 'profiles';
      
      // Convert Blob to File
      const file = new File([croppedBlob], fileName, { type: 'image/jpeg' });
      const url = await uploadFile(bucket, file, `${profile.id}/${fileName}`);
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ [type === 'avatar' ? 'avatar_url' : 'banner_url']: url })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      if (type === 'avatar') setAvatar(url);
      else setBanner(url);
      
      toast.success(`${type === 'avatar' ? 'Avatar' : 'Banner'} updated!`);
    } catch (error: any) {
      toast.error(error.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  if (isProfileLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground font-medium">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between bg-background/80 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md border-b border-border/50">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate({ to: "/app/profile/" })} 
            className="grid h-8 w-8 place-items-center rounded-full transition active:bg-accent/50"
            disabled={loading}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-lg font-bold">Edit profile</h1>
        </div>
        <button 
          onClick={handleSave}
          disabled={loading}
          className="rounded-full bg-foreground px-5 py-1.5 text-sm font-bold text-background transition active:opacity-80 flex items-center gap-2 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
      </header>

      <main>
        {/* Banner Edit */}
        <div className="relative h-32 w-full bg-accent/20 overflow-hidden">
          {banner ? (
            <img src={banner} className="h-full w-full object-cover" alt="Banner" />
          ) : (
            <div className="h-full w-full" style={{ background: "linear-gradient(135deg,#cc208f,#a78bfa,#60a5fa)" }} />
          )}
          <div className="absolute inset-0 flex items-center justify-center gap-4 bg-black/30">
            <button 
              onClick={() => bannerInputRef.current?.click()}
              disabled={loading}
              className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition active:scale-95 disabled:opacity-50"
            >
              <Camera className="h-5 w-5" />
            </button>
            <input 
              type="file" 
              ref={bannerInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={(e) => onFileChange(e, 'banner')} 
            />
            {banner && (
              <button className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition active:scale-95">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Profile Pic Edit */}
        <div className="px-5">
          <div className="relative -mt-10 inline-block">
            <div 
              className="grid h-20 w-20 place-items-center rounded-[28%] border-4 border-background overflow-hidden shadow-glow" 
              style={{ background: "linear-gradient(135deg,#cc208f,#a78bfa)" }}
            >
              {avatar ? (
                <img src={avatar} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl font-display font-bold text-primary-foreground">
                  {(profile?.full_name || profile?.username || 'A').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="absolute inset-0 flex items-center justify-center rounded-[28%] bg-black/30">
              <button 
                onClick={() => avatarInputRef.current?.click()}
                disabled={loading}
                className="grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition active:scale-95 disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input 
                type="file" 
                ref={avatarInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={(e) => onFileChange(e, 'avatar')} 
              />
            </div>
          </div>
        </div>

        {/* Form Fields */}
        <div className="mt-8 space-y-6 px-5 pb-10">
          <div className="space-y-1.5 border-b border-border pb-2 focus-within:border-primary transition-colors">
            <label className="text-xs font-bold text-muted-foreground ml-1">Name</label>
            <input 
              value={formData.full_name}
              onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              className="w-full bg-transparent px-1 text-lg font-medium outline-none"
              placeholder="Your full name"
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5 border-b border-border pb-2 focus-within:border-primary transition-colors">
            <label className="text-xs font-bold text-muted-foreground ml-1">Bio</label>
            <textarea 
              value={formData.bio}
              onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              rows={3}
              className="w-full resize-none bg-transparent px-1 text-base leading-relaxed outline-none"
              placeholder="Tell us about yourself"
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5 border-b border-border pb-2 focus-within:border-primary transition-colors">
            <label className="text-xs font-bold text-muted-foreground ml-1">Location</label>
            <input 
              value={formData.location}
              onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
              className="w-full bg-transparent px-1 text-base outline-none"
              placeholder="Where are you based?"
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5 border-b border-border pb-2 focus-within:border-primary transition-colors">
            <label className="text-xs font-bold text-muted-foreground ml-1">Website</label>
            <input 
              value={formData.website}
              onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
              className="w-full bg-transparent px-1 text-base text-primary outline-none"
              placeholder="Your website URL"
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5 border-b border-border pb-2 focus-within:border-primary transition-colors">
            <label className="text-xs font-bold text-muted-foreground ml-1">Birth date</label>
            <button className="w-full text-left bg-transparent px-1 text-base outline-none text-foreground/50">
              Add your date of birth
            </button>
          </div>

          <div className="pt-4">
            <button className="w-full rounded-full border border-border py-3 text-sm font-bold transition hover:bg-accent/10 active:scale-[0.98">
              Switch to Professional
            </button>
          </div>

          <div className="pt-6 border-t border-border">
            <h3 className="text-lg font-bold mb-1">Tips</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              How your profile appears to others. Make sure your bio and location are up to date to help other builders find you.
            </p>
          </div>
        </div>
      </main>

      {cropImage && (
        <ImageCropper 
          image={cropImage.src} 
          aspect={cropImage.type === 'avatar' ? 1 : 16/5} 
          onCropComplete={handleCropComplete} 
          onCancel={() => setCropImage(null)} 
        />
      )}
    </div>
  );
}
