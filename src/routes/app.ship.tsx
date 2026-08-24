import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { 
  ArrowLeft, UploadCloud, X, Plus, Rocket, Link as LinkIcon, 
  Code, Loader2, Wand2, Globe, Lock, Coins, CheckCircle2, GitBranch, ShieldCheck
} from "@/components/icons/solar";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/storage";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/app/ship")({
  validateSearch: (search: Record<string, unknown>): { editId?: string; versionOf?: string } => {
    const next: { editId?: string; versionOf?: string } = {};
    if (typeof search.editId === "string" && search.editId) next.editId = search.editId;
    if (typeof search.versionOf === "string" && search.versionOf) next.versionOf = search.versionOf;
    return next;
  },
  component: ShipPage,
});

const CATEGORIES = [
  "Web App", "Mobile App", "Website", "AI Agent", "Prompt System", 
  "Design", "Video", "Audio", "Writing", "Marketing", "Research", "Other"
];

const nextVersion = (version?: string | null) => {
  const [major = 1, minor = 0] = (version || '1.0.0').split('.').map(Number);
  return `${Number.isFinite(major) ? major : 1}.${(Number.isFinite(minor) ? minor : 0) + 1}.0`;
};

function ShipPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useUser();
  
  const [category, setCategory] = useState("Web App");
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  
  const [images, setImages] = useState<(File | null)[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  
  const [links, setLinks] = useState([{ title: "Live URL", url: "" }]);
  const [skills, setSkills] = useState("");
  
  const [usedAi, setUsedAi] = useState(false);
  const [prompts, setPrompts] = useState("");
  
  const [enrolledBootcamps, setEnrolledBootcamps] = useState<any[]>([]);
  const [selectedBootcampId, setSelectedBootcampId] = useState<string | null>(null);
  
  const [visibility, setVisibility] = useState<"Public" | "Club Only">("Public");
  const [projectRootId, setProjectRootId] = useState<string | null>(null);
  const [versionLabel, setVersionLabel] = useState("1.0.0");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [availableForUse, setAvailableForUse] = useState(false);
  const [licenseType, setLicenseType] = useState<"standard" | "commercial" | "full_ownership">("standard");
  const [licensePrice, setLicensePrice] = useState("");
  
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchEnrolledBootcamps() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const { data } = await supabase
        .from('enrollments')
        .select('*, bootcamps(*)')
        .eq('profile_id', session.user.id);
      
      if (data) {
        const bootcamps = data.map((e: any) => e.bootcamps).filter(Boolean);
        setEnrolledBootcamps(bootcamps);
      }
    }
    fetchEnrolledBootcamps();
  }, []);

  const { editId, versionOf } = Route.useSearch();
  const isNewVersion = Boolean(versionOf);

  useEffect(() => {
    async function fetchEditPost() {
      const sourceId = editId || versionOf;
      if (!sourceId) return;
      const { data } = await supabase
        .from('posts')
        .select('*')
        .eq('id', sourceId)
        .single();
      
      if (data) {
        // Parse markdown back into form
        const lines = data.content.split('\n');
        let parsedProject = "";
        let parsedCategory = "Web App";
        let parsedDescription = [];
        let parsedSkills = "";
        let parsedLinks = [];
        let parsedPrompts = "";
        let parsedUsedAi = false;
        
        let currentSection = "description";
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('**Project:**')) {
            parsedProject = line.replace('**Project:**', '').trim();
            continue;
          }
          if (line.startsWith('**Category:**')) {
            parsedCategory = line.replace('**Category:**', '').trim();
            continue;
          }
          if (line.startsWith('**Skills Used:**')) {
            parsedSkills = line.replace('**Skills Used:**', '').replace(/#/g, '').replace(/\s+/g, ', ').trim();
            continue;
          }
          if (line.startsWith('**Project Links:**')) {
            currentSection = "links";
            continue;
          }
          if (line.startsWith('**AI Prompts Used:**')) {
            currentSection = "prompts";
            parsedUsedAi = true;
            continue;
          }
          
          if (currentSection === "links") {
            if (line.trim().startsWith('- [')) {
              const match = line.match(/- \[(.*?)\]\((.*?)\)/);
              if (match) {
                parsedLinks.push({ title: match[1], url: match[2] });
              }
            }
          } else if (currentSection === "prompts") {
            if (line.trim().startsWith('> ')) {
              parsedPrompts += line.replace(/^> /, '') + '\n';
            } else if (line.trim() !== '') {
              parsedPrompts += line + '\n';
            }
          } else {
            if (line.trim() === '' && parsedDescription.length === 0) continue;
            parsedDescription.push(line);
          }
        }
        
        setProjectName(parsedProject);
        setCategory(parsedCategory);
        setDescription(parsedDescription.join('\n').trim());
        setSkills(parsedSkills);
        if (parsedLinks.length > 0) setLinks(parsedLinks);
        setUsedAi(parsedUsedAi);
        setPrompts(parsedPrompts.trim());

        if (data.media_urls) {
          setPreviews(data.media_urls);
          setImages(data.media_urls.map(() => null));
        }

        if (data.bootcamp_id) {
          setSelectedBootcampId(data.bootcamp_id);
        }

        setProjectRootId(data.project_root_id || data.id);
        setVersionLabel(isNewVersion ? nextVersion(data.version_label) : (data.version_label || '1.0.0'));
        setReleaseNotes(isNewVersion ? '' : (data.release_notes || ''));
        setAvailableForUse(Boolean(data.available_for_use));
        setLicenseType(data.license_type || 'standard');
        setLicensePrice(data.license_price ? String(data.license_price) : '');
      }
    }
    fetchEditPost();
  }, [editId, versionOf, isNewVersion]);

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const newFiles = Array.from(files);
    const nextImages = [...images, ...newFiles];
    setImages(nextImages);
    
    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setPreviews(prev => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const constructMarkdownBody = () => {
    let md = `**Project:** ${projectName}\n\n`;
    md += `**Category:** ${category}\n\n`;
    
    if (description) {
      md += `${description}\n\n`;
    }
    
    if (skills) {
      md += `**Skills Used:** ${skills.split(',').map(s => "#" + s.trim().replace(/\s+/g, '')).join(' ')}\n\n`;
    }
    
    const validLinks = links.filter(l => l.url);
    if (validLinks.length > 0) {
      md += `**Project Links:**\n`;
      validLinks.forEach(l => {
        md += `- [${l.title || 'Link'}](${l.url})\n`;
      });
      md += `\n`;
    }
    
    if (usedAi && prompts) {
      md += `**AI Prompts Used:**\n`;
      md += `> ${prompts.replace(/\n/g, '\n> ')}\n\n`;
    }
    
    return md;
  };

  const handleShip = async () => {
    if (!projectName.trim()) {
      toast.error("Project Name is required!");
      return;
    }
    if (images.length === 0 && !description.trim() && links.filter(l => l.url).length === 0) {
      toast.error("Please provide some proof of work (Description, Image, or Link)");
      return;
    }

    try {
      setUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to ship work");
        return;
      }

      let media_urls: string[] = [];
      const newFiles = images.filter(img => img !== null) as File[];
      if (newFiles.length > 0) {
        const uploadedUrls = await uploadMedia(newFiles, user.id);
        media_urls = [...uploadedUrls];
      }
      
      const keptExistingUrls = previews.filter(p => p.startsWith('http'));
      media_urls = [...keptExistingUrls, ...media_urls];

      const postData: any = {
        author_id: user.id,
        content: constructMarkdownBody(),
        media_urls,
        is_build_post: true, // It's a Ship post
        project_root_id: isNewVersion ? projectRootId : (editId ? projectRootId : null),
        version_label: versionLabel.trim() || '1.0.0',
        release_notes: releaseNotes.trim() || null,
        available_for_use: availableForUse,
        license_type: licenseType,
        license_price: availableForUse ? Math.max(0, Number(licensePrice) || 0) : 0,
      };

      if (selectedBootcampId) {
        postData.bootcamp_id = selectedBootcampId;
      }

      let newPost;
      if (editId && !isNewVersion) {
        const { data, error: postError } = await supabase
          .from('posts')
          .update(postData)
          .eq('id', editId)
          .select()
          .single();
        if (postError) throw postError;
        newPost = data;
      } else {
        const { data, error: postError } = await supabase
          .from('posts')
          .insert([postData])
          .select()
          .single();
        if (postError) throw postError;
        newPost = data;
      }

      // Notify bootcamp creator if applicable
      if (selectedBootcampId && newPost) {
        const bootcamp = enrolledBootcamps.find(b => b.id === selectedBootcampId);
        if (bootcamp && bootcamp.creator_id) {
          await supabase
            .from('notifications')
            .insert([{
              recipient_id: bootcamp.creator_id,
              actor_id: user.id,
              type: 'build_tagged',
              content: `shipped their project in ${bootcamp.title}. Click to verify!`,
              entity_id: newPost.id
            }]);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
      queryClient.invalidateQueries({ queryKey: ['my_profile'] });
      queryClient.invalidateQueries({ queryKey: ['profile', 'current'] });
      queryClient.invalidateQueries({ queryKey: ['zerohub_projects'] });
      
      toast.success(editId && !isNewVersion ? "Project updated successfully" : "Project shipped successfully! +50 XP");
      navigate({ to: "/app/zerohub" });
    } catch (error: any) {
      toast.error(error.message || "Failed to ship project");
    } finally {
      setUploading(false);
    }
  };

  const canShip = projectName.trim().length > 0 && !uploading;

  return (
    <div className="min-h-screen bg-[#f8f7f5] pb-10 dark:bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 h-[calc(72px+env(safe-area-inset-top))] border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-[72px] max-w-[900px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate({ to: "/app" })}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card tap hover:bg-accent"
            >
              <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
            </button>
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight flex items-center gap-2">
                {isNewVersion ? "Release a new version" : editId ? "Edit shipped project" : "Ship Work"}
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {isNewVersion ? "Publish the latest work above the previous release." : "What did you ship today?"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[900px] space-y-4 p-4 sm:space-y-5 sm:p-6">
        
        {/* Basic Info */}
        <section className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Project Name *</label>
            <input 
              type="text"
              placeholder="E.g., Zero Club Builder App"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-3.5 text-[15px] font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Category</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`rounded-lg border px-4 py-2 text-[12px] font-semibold tap transition-all ${
                    category === cat 
                      ? "bg-foreground text-background border-transparent"
                      : "bg-background border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Description</label>
            <textarea 
              placeholder="What did you build? How does it work?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-4 py-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary"
            />
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">Release details</h2>
              <p className="text-[11.5px] text-muted-foreground">Keep every update attached to the same shipped project.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
            <div>
              <label className="ml-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Version</label>
              <input
                value={versionLabel}
                onChange={(event) => setVersionLabel(event.target.value)}
                placeholder="1.0.0"
                className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="ml-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">What changed</label>
              <input
                value={releaseNotes}
                onChange={(event) => setReleaseNotes(event.target.value)}
                placeholder="New features, fixes, or improvements"
                className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
        </section>

        {/* Proof of Work */}
        <section className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[16px] font-semibold tracking-tight">Proof of work</h2>
          </div>
          <p className="text-xs text-muted-foreground -mt-3">Upload screenshots, videos, or demos of what you shipped.</p>
          
          <div className="grid grid-cols-2 gap-4">
            {previews.map((src, i) => {
              const isVideo = images[i] ? images[i]?.type.startsWith('video/') : (src.includes('.mp4') || src.includes('.mov') || src.includes('.webm'));
              return (
                <div key={i} className="group relative aspect-video overflow-hidden rounded-lg border border-border bg-muted">
                  {isVideo ? (
                    <video src={src} className="w-full h-full object-cover" />
                  ) : (
                    <img src={src} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  )}
                  <button 
                    onClick={() => {
                      setImages(prev => prev.filter((_, idx) => idx !== i));
                      setPreviews(prev => prev.filter((_, idx) => idx !== i));
                    }}
                    className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-md transition active:scale-90"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
            >
              <UploadCloud className="h-6 w-6" />
              <span className="text-xs font-bold">Upload Media</span>
            </button>
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*,video/*" 
              multiple 
              className="hidden" 
              onChange={handleMediaUpload} 
            />
          </div>
        </section>

        {/* Project Details */}
        <section className="space-y-6 rounded-lg border border-border bg-card p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Project Links</label>
            </div>
            <div className="space-y-3">
              {links.map((link, i) => (
                <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input 
                    type="text"
                    placeholder="Link Title (e.g., Live URL, GitHub)"
                    value={link.title}
                    onChange={(e) => {
                      const newLinks = [...links];
                      newLinks[i].title = e.target.value;
                      setLinks(newLinks);
                    }}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary sm:w-1/3"
                  />
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input 
                      type="url"
                      placeholder="https://"
                      value={link.url}
                      onChange={(e) => {
                        const newLinks = [...links];
                        newLinks[i].url = e.target.value;
                        setLinks(newLinks);
                      }}
                      className="w-full rounded-lg border border-border bg-background px-4 py-3 pl-9 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  {links.length > 1 && (
                    <button 
                      onClick={() => setLinks(links.filter((_, idx) => idx !== i))}
                      className="p-2 text-muted-foreground hover:text-destructive transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <button 
                onClick={() => setLinks([...links, { title: "", url: "" }])}
                className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
              >
                <Plus className="h-3 w-3" /> Add Link
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-border/40">
            <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ml-1">Skills Used</label>
            <div className="relative mt-2">
              <Code className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input 
                type="text"
                placeholder="React, Next.js, Figma, Tailwind (comma separated)"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-4 py-3.5 pl-11 text-sm outline-none transition-colors focus:border-primary"
              />
            </div>
          </div>
          
          <div className="pt-2 border-t border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-bold text-foreground">AI Assistance</label>
                <p className="text-xs text-muted-foreground mt-0.5">Did you use AI (Cursor, ChatGPT) to build this?</p>
              </div>
              <Switch checked={usedAi} onCheckedChange={setUsedAi} />
            </div>
            
            {usedAi && (
              <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                <div className="relative">
                  <Wand2 className="absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
                  <textarea 
                    placeholder="What prompts or tools did you use? Share your AI workflow..."
                    value={prompts}
                    onChange={(e) => setPrompts(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-border bg-background px-4 py-3.5 pl-11 text-sm outline-none transition-colors focus:border-primary"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight">Allow others to use this work</h2>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">Offer clear usage rights for free or for Zero Club Coins.</p>
              </div>
            </div>
            <Switch checked={availableForUse} onCheckedChange={setAvailableForUse} />
          </div>

          {availableForUse && (
            <div className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div>
                <label className="ml-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Rights offered</label>
                <select
                  value={licenseType}
                  onChange={(event) => setLicenseType(event.target.value as typeof licenseType)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
                >
                  <option value="standard">Standard use</option>
                  <option value="commercial">Commercial use</option>
                  <option value="full_ownership">Full ownership transfer</option>
                </select>
              </div>
              <div>
                <label className="ml-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Price</label>
                <div className="relative mt-1">
                  <Coins className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="number"
                    min="0"
                    value={licensePrice}
                    onChange={(event) => setLicensePrice(event.target.value)}
                    placeholder="Free"
                    className="w-full rounded-lg border border-border bg-background py-3 pl-10 pr-4 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground sm:col-span-2">
                {licenseType === 'full_ownership'
                  ? 'The buyer receives ownership rights to use and adapt this release as they choose.'
                  : licenseType === 'commercial'
                    ? 'The buyer may use and adapt this release in commercial work while you keep ownership.'
                    : 'The buyer may use and adapt this release in their own work while you keep ownership.'}
              </p>
            </div>
          )}
        </section>

        {/* Club Selection & Visibility */}
        <section className="space-y-2">
          {enrolledBootcamps.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-bold">Ship into a Club</span>
                <span className="text-xs text-muted-foreground">Submit this as part of a Bootcamp</span>
              </div>
              <select 
                value={selectedBootcampId || ""}
                onChange={(e) => setSelectedBootcampId(e.target.value || null)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium outline-none sm:max-w-[240px]"
              >
                <option value="">None (Global)</option>
                {enrolledBootcamps.map(bc => (
                  <option key={bc.id} value={bc.id}>{bc.title}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card p-1">
            <button 
              onClick={() => setVisibility("Public")}
              className={`flex items-center justify-between rounded-lg p-4 transition ${visibility === "Public" ?"bg-accent/60" : "hover:bg-accent/30"}`}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Globe className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-foreground">Public Feed</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Visible to everyone in Zero Club</p>
                </div>
              </div>
              {visibility === "Public" && <CheckCircle2 className="h-5 w-5 text-primary" />}
            </button>
            <button 
              onClick={() => setVisibility("Club Only")}
              className={`flex items-center justify-between rounded-lg p-4 transition ${visibility === "Club Only" ?"bg-accent/60" : "hover:bg-accent/30"}`}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center text-muted-foreground">
                  <Lock className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-foreground">Club Only</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Visible only within selected club</p>
                </div>
              </div>
              {visibility === "Club Only" && <CheckCircle2 className="h-5 w-5 text-foreground" />}
            </button>
          </div>
        </section>

        {/* Bottom Ship Button */}
        <div className="mt-6 px-1">
          <button 
            onClick={handleShip}
            disabled={!canShip}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 text-[16px] font-semibold text-primary-foreground tap hover:bg-primary/90 disabled:opacity-40"
          >
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Shipping...
              </>
            ) : (
              isNewVersion ? `Release ${versionLabel || 'new version'}` : editId ? "Save changes" : "Ship Project"
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
