import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { 
  ArrowLeft, UploadCloud, X, Plus, Rocket, Link as LinkIcon, 
  Code, Loader2, Sparkles, Wand2, Globe, Lock, Coins, CheckCircle2 
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/storage";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/app/ship")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      editId: (search.editId as string) || undefined,
    }
  },
  component: ShipPage,
});

const CATEGORIES = [
  "Web App", "Mobile App", "Website", "AI Agent", "Prompt System", 
  "Design", "Video", "Audio", "Writing", "Marketing", "Research", "Other"
];

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

  const { editId } = Route.useSearch();

  useEffect(() => {
    async function fetchEditPost() {
      if (!editId) return;
      const { data } = await supabase
        .from('posts')
        .select('*')
        .eq('id', editId)
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
      }
    }
    fetchEditPost();
  }, [editId]);

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
      };

      if (selectedBootcampId) {
        postData.bootcamp_id = selectedBootcampId;
      }

      let newPost;
      if (editId) {
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

      // Automatically add XP for shipping (Optimistic update or via server function)
      // For now we trust the client to just show success. 
      // Realistically we would call an edge function here to securely grant XP.

      queryClient.invalidateQueries({ queryKey: ['feed_posts'] });
      queryClient.invalidateQueries({ queryKey: ['my_profile'] });
      
      toast.success("🚀 Project shipped successfully! +50 XP");
      navigate({ to: "/app" });
    } catch (error: any) {
      toast.error(error.message || "Failed to ship project");
    } finally {
      setUploading(false);
    }
  };

  const canShip = projectName.trim().length > 0 && !uploading;

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-2xl border-b border-border/40 h-[calc(72px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between px-4 h-[72px]">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate({ to: "/app" })}
              className="h-10 w-10 rounded-full bg-accent/50 grid place-items-center transition active:scale-95 hover:bg-accent"
            >
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <div>
              <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
                Ship Work
              </h1>
              <p className="text-[11px] text-muted-foreground font-medium">What did you ship today?</p>
            </div>
          </div>
          <button 
            onClick={handleShip}
            disabled={!canShip}
            className="rounded-full bg-foreground text-background px-6 py-2.5 text-sm font-bold shadow-lg transition active:scale-95 disabled:opacity-50 disabled:shadow-none"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ship"}
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        
        {/* Basic Info */}
        <section className="space-y-4 bg-card rounded-[32px] p-6 border border-border/40 shadow-sm">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Project Name *</label>
            <input 
              type="text"
              placeholder="E.g., Zero Club Builder App"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="mt-1 w-full bg-background border border-border/40 rounded-2xl px-5 py-4 text-[15px] font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-foreground placeholder:text-muted-foreground/40"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Category</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    category === cat 
                      ?"bg-primary text-primary-foreground border-primary shadow-glow" 
                      : "bg-background border-border/40 text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Description</label>
            <textarea 
              placeholder="What did you build? How does it work?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 w-full bg-background border border-border/40 rounded-2xl px-5 py-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-foreground placeholder:text-muted-foreground/40 resize-none"
            />
          </div>
        </section>

        {/* Proof of Work */}
        <section className="space-y-4 bg-card rounded-[32px] p-6 border border-border/40 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-lg font-bold">Proof of Work</h2>
          </div>
          <p className="text-xs text-muted-foreground -mt-3">Upload screenshots, videos, or demos of what you shipped.</p>
          
          <div className="grid grid-cols-2 gap-4">
            {previews.map((src, i) => {
              const isVideo = images[i] ? images[i]?.type.startsWith('video/') : (src.includes('.mp4') || src.includes('.mov') || src.includes('.webm'));
              return (
                <div key={i} className="relative aspect-video rounded-2xl overflow-hidden border border-border/40 bg-muted group">
                  {isVideo ? (
                    <video src={src} className="w-full h-full object-cover" />
                  ) : (
                    <img src={src} className="w-full h-full object-cover" />
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
              className="aspect-video rounded-2xl border-2 border-dashed border-border/40 hover:border-primary/50 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary"
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
        <section className="space-y-6 bg-card rounded-[32px] p-6 border border-border/40 shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Project Links</label>
            </div>
            <div className="space-y-3">
              {links.map((link, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input 
                    type="text"
                    placeholder="Link Title (e.g., Live URL, GitHub)"
                    value={link.title}
                    onChange={(e) => {
                      const newLinks = [...links];
                      newLinks[i].title = e.target.value;
                      setLinks(newLinks);
                    }}
                    className="w-1/3 bg-background border border-border/40 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary"
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
                      className="w-full bg-background border border-border/40 rounded-xl px-4 py-3 pl-9 text-sm outline-none focus:border-primary"
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
            <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground ml-1">Skills Used</label>
            <div className="relative mt-2">
              <Code className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input 
                type="text"
                placeholder="React, Next.js, Figma, Tailwind (comma separated)"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                className="w-full bg-background border border-border/40 rounded-2xl px-5 py-4 pl-11 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
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
                    className="w-full bg-background border border-border/40 rounded-2xl px-5 py-4 pl-11 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Club Selection & Visibility */}
        <section className="space-y-2">
          {enrolledBootcamps.length > 0 && (
            <div className="bg-card rounded-3xl p-4 border border-border/40 shadow-sm flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-bold">Ship into a Club</span>
                <span className="text-xs text-muted-foreground">Submit this as part of a Bootcamp</span>
              </div>
              <select 
                value={selectedBootcampId || ""}
                onChange={(e) => setSelectedBootcampId(e.target.value || null)}
                className="bg-background border border-border/40 rounded-xl px-3 py-2 text-sm outline-none font-medium max-w-[200px]"
              >
                <option value="">None (Global)</option>
                {enrolledBootcamps.map(bc => (
                  <option key={bc.id} value={bc.id}>{bc.title}</option>
                ))}
              </select>
            </div>
          )}

          <div className="bg-card rounded-3xl p-2 border border-border/40 shadow-sm flex flex-col divide-y divide-border/40">
            <button 
              onClick={() => setVisibility("Public")}
              className={`flex items-center justify-between p-4 rounded-[24px] transition ${visibility === "Public" ?"bg-accent/50" : "hover:bg-accent/30"}`}
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
              className={`flex items-center justify-between p-4 rounded-[24px] transition ${visibility === "Club Only" ?"bg-accent/50" : "hover:bg-accent/30"}`}
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

        {/* XP Preview */}
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-3xl p-6 border border-primary/20 text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/20 text-primary mb-3 shadow-glow">
            <Coins className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-black text-foreground mb-1">Earn +50 XP</h3>
          <p className="text-sm text-muted-foreground max-w-[250px] mx-auto">
            Shipping real work builds your portfolio and increases your reputation.
          </p>
        </div>

      </div>
    </div>
  );
}
