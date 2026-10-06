import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  X, Plus, Link as LinkIcon, Loader2, Coins, Image as ImageIcon, GraduationCap, UserPlus
} from "@/components/icons/glyphs";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/storage";
import { toast } from "sonner";
import { useUser } from "@/hooks/useUser";
import { CollaboratorPicker, type Collaborator } from "@/components/CollaboratorPicker";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { notifyMentionedUsers } from "@/lib/mentions";
import { ProjectPublishConfirmation, preparePublication, type PublicationAttempt } from "@/features/zeroAI/ProjectPublishConfirmation";

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
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  /* "Tools", not "Skills". What a reader wants from a shipped project is what
     it was built with, which is a fact about the work; a skill is a claim
     about the person, and the two were being collected in one box. */
  const [tools, setTools] = useState("");
  
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
  const [confirmation, setConfirmation] = useState<PublicationAttempt | null>(null);
  const shipPending = useRef(false);
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
        let parsedTools = "";
        let parsedCollaboratorHandles: string[] = [];
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
          /* Ships written before the rename still say "Skills Used:", and
             they are not going to be rewritten in the database. Both markers
             parse into the same field. */
          if (line.startsWith('**Tools Used:**') || line.startsWith('**Skills Used:**')) {
            parsedTools = line
              .replace('**Tools Used:**', '')
              .replace('**Skills Used:**', '')
              .replace(/#/g, '')
              .replace(/\s+/g, ', ')
              .trim();
            continue;
          }
          if (line.startsWith('**Collaborators:**')) {
            parsedCollaboratorHandles = line
              .replace('**Collaborators:**', '')
              .split(/[\s,]+/)
              .map((handle: string) => handle.replace(/^@/, '').trim())
              .filter(Boolean);
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
        setTools(parsedTools);

        /* Re-resolved from handles rather than trusted from the markdown: an
           account can be renamed or deleted between versions, and a credit
           pointing at nobody is worse than no credit. */
        if (parsedCollaboratorHandles.length > 0) {
          const { data: people } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('username', parsedCollaboratorHandles);
          setCollaborators((people || []) as Collaborator[]);
        }
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
    
    if (collaborators.length > 0) {
      md += `**Collaborators:** ${collaborators.map((person) => '@' + person.username).join(' ')}\n\n`;
    }

    if (tools) {
      md += `**Tools Used:** ${tools.split(',').map(s => "#" + s.trim().replace(/\s+/g, '')).join(' ')}\n\n`;
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
    if (shipPending.current || confirmation) return;
    if (!projectName.trim()) {
      toast.error("Project Name is required!");
      return;
    }
    if (images.length === 0 && !description.trim() && links.filter(l => l.url).length === 0) {
      toast.error("Please provide some proof of work (Description, Image, or Link)");
      return;
    }

    try {
      shipPending.current = true;
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

      postData.audience = visibility === "Club Only" ? "club" : "everyone";
      const attempt = await preparePublication(postData, editId && !isNewVersion ? editId : null);
      setConfirmation(attempt);
    } catch (error: any) {
      toast.error(error.message || "Failed to ship project");
    } finally {
      shipPending.current = false;
      setUploading(false);
    }
  };

  const completePublication = async (postId: string, attempt: PublicationAttempt) => {
    const bootcampId = attempt.payload.bootcamp_id;
    const bootcamp = enrolledBootcamps.find(b => b.id === bootcampId);
    // Notifications are secondary; a notification failure must never imply publication failed.
    if (bootcamp?.creator_id && profile?.id) {
      void supabase.from('notifications').insert([{ recipient_id: bootcamp.creator_id, actor_id: profile.id, type: 'build_tagged', content: 'shipped their project in ' + bootcamp.title + '. Click to verify!', entity_id: postId }]).then(({ error }) => { if(error) console.warn('Project notification could not be sent'); });
    }
    if(profile?.id) void notifyMentionedUsers({ content: attempt.payload.content || '', actorId: profile.id, entityId: postId, type: 'post' });
    for (const key of ['feed_posts','my_profile','zerohub_projects']) void queryClient.invalidateQueries({ queryKey: [key] });
    void queryClient.invalidateQueries({ queryKey: ['profile','current'] });
    setConfirmation(null);
    toast.success(attempt.target_id ? 'Project updated successfully' : 'Project published successfully!');
    navigate({ to: '/app/zerohub' });
  };

  const canShip = projectName.trim().length > 0 && !uploading && !confirmation;
  const toolList = tools.split(',').map((tool) => tool.trim()).filter(Boolean);
  const addTool = (raw: string) => {
    const next = raw.replace(/,/g, ' ').trim();
    if (!next || toolList.some((tool) => tool.toLowerCase() === next.toLowerCase())) return;
    setTools([...toolList, next].join(', '));
  };
  const [toolDraft, setToolDraft] = useState("");
  const shipLabel = isNewVersion ? `Release ${versionLabel || 'update'}` : editId ? "Save" : "Publish";

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {confirmation && <ProjectPublishConfirmation attempt={confirmation} onReplace={setConfirmation} onClose={() => setConfirmation(null)} onPublished={completePublication} />}
      <header className="sticky top-0 z-50 border-b border-border bg-card pt-[env(safe-area-inset-top)]">
        <div className="zc-page-width mx-auto flex h-14 w-full max-w-[680px] items-center gap-1 px-2">
          <button
            onClick={() => navigate({ to: "/app" })}
            aria-label="Close"
            className="grid h-11 w-10 shrink-0 place-items-center rounded-full text-foreground tap hover:bg-foreground/[0.04]"
          >
            <X className="h-[22px] w-[22px]" />
          </button>
          <h1 className="min-w-0 flex-1 truncate font-display text-[18px] font-semibold text-foreground">
            {isNewVersion ? "Release a new version" : editId ? "Edit project" : "Ship a project"}
          </h1>
          <button
            onClick={handleShip}
            disabled={!canShip}
            className="flex h-9 min-w-[84px] items-center justify-center rounded-full bg-[#cc208f] px-4 text-[15px] font-semibold text-white tap hover:bg-[#b01c7b] disabled:opacity-40"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : shipLabel}
          </button>
        </div>
      </header>

      <div className="zc-page-width mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-2 md:py-2">
        <section className={SECTION}>
          <p className="text-[14px] text-muted-foreground">
            {isNewVersion ? "Publish the latest work above the previous release." : "Proof of work — show what you built, how, and with what."}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {previews.map((src, i) => {
              const isVideo = images[i] ? images[i]?.type.startsWith('video/') : (src.includes('.mp4') || src.includes('.mov') || src.includes('.webm'));
              return (
                <div key={i} className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                  {isVideo ? (
                    <video src={src} className="h-full w-full object-cover" />
                  ) : (
                    <img src={src} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  )}
                  {i === 0 && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">Cover</span>
                  )}
                  <button
                    onClick={() => {
                      setImages(prev => prev.filter((_, idx) => idx !== i));
                      setPreviews(prev => prev.filter((_, idx) => idx !== i));
                    }}
                    aria-label="Remove"
                    className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white transition active:scale-90"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-foreground/25 text-muted-foreground transition-colors hover:border-foreground/45 hover:text-foreground ${previews.length === 0 ? "col-span-2 h-[180px]" : "aspect-video"}`}
            >
              <ImageIcon className="h-7 w-7" />
              <span className="text-[15px] font-semibold text-foreground">{previews.length === 0 ? "Add screenshots or a demo video" : "Add more"}</span>
              {previews.length === 0 && <span className="text-[13px]">The first one becomes the cover</span>}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleMediaUpload} />
          </div>
        </section>

        <section className={`${SECTION} flex flex-col gap-4`}>
          <h2 className="font-display text-[18px] font-semibold">The project</h2>
          <label className="block">
            <span className={LABEL}>Project name</span>
            <input
              type="text"
              placeholder="E.g., Zero Club Builder App"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className={FIELD}
            />
          </label>
          <div>
            <span className={LABEL}>Category</span>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`h-8 rounded-full px-3.5 text-[13px] font-semibold tap transition ${
                    category === cat ? "bg-foreground text-background" : "border border-foreground/25 text-muted-foreground hover:border-foreground/45"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className={LABEL}>Description</span>
            <textarea
              placeholder="What did you build? How does it work?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={`${FIELD} h-auto resize-none py-2.5 leading-relaxed`}
            />
          </label>
          <div>
            <span className={LABEL}>Tools used</span>
            <div className="flex flex-wrap gap-2">
              {toolList.map((tool) => (
                <span key={tool} className="flex h-8 items-center gap-1 rounded-full bg-foreground/[0.06] pl-3 pr-1.5 text-[14px] font-medium">
                  {tool}
                  <button
                    type="button"
                    aria-label={`Remove ${tool}`}
                    onClick={() => setTools(toolList.filter((item) => item !== tool).join(', '))}
                    className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              <input
                value={toolDraft}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.includes(',')) { addTool(value); setToolDraft(""); } else setToolDraft(value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addTool(toolDraft); setToolDraft(""); }
                  if (e.key === 'Backspace' && !toolDraft && toolList.length) setTools(toolList.slice(0, -1).join(', '));
                }}
                onBlur={() => { if (toolDraft) { addTool(toolDraft); setToolDraft(""); } }}
                placeholder={toolList.length ? "Add" : "React, Figma, Supabase…"}
                className="h-8 min-w-[110px] flex-1 rounded-full border border-dashed border-foreground/30 bg-transparent px-3 text-[14px] outline-none placeholder:text-muted-foreground focus:border-foreground/50"
              />
            </div>
          </div>
          <div>
            <span className={LABEL}>Project links</span>
            <div className="overflow-hidden rounded-[10px] border border-foreground/15">
              {links.map((link, i) => (
                <div key={i} className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                  <LinkIcon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Title"
                    value={link.title}
                    onChange={(e) => {
                      const newLinks = [...links];
                      newLinks[i].title = e.target.value;
                      setLinks(newLinks);
                    }}
                    className="h-9 w-[92px] shrink-0 bg-transparent text-[14px] font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
                  />
                  <input
                    type="url"
                    placeholder="https://"
                    value={link.url}
                    onChange={(e) => {
                      const newLinks = [...links];
                      newLinks[i].url = e.target.value;
                      setLinks(newLinks);
                    }}
                    className="h-9 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
                  />
                  {links.length > 1 && (
                    <button
                      onClick={() => setLinks(links.filter((_, idx) => idx !== i))}
                      aria-label="Remove link"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setLinks([...links, { title: "", url: "" }])}
                className="flex h-12 w-full items-center gap-2.5 px-3 text-[14px] font-semibold text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground"
              >
                <Plus className="h-[18px] w-[18px]" /> Add a link (GitHub, Figma, demo)
              </button>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-[15px] font-medium">Did you use AI to build this?</p>
                <p className="text-[13px] text-muted-foreground">Share the tools and prompts that helped</p>
              </div>
              <Switch checked={usedAi} onCheckedChange={setUsedAi} />
            </div>
            {usedAi && (
              <textarea
                placeholder="What prompts or tools did you use? Share your AI workflow…"
                value={prompts}
                onChange={(e) => setPrompts(e.target.value)}
                rows={3}
                className={`${FIELD} mt-3 h-auto resize-none py-2.5 animate-in fade-in slide-in-from-top-1`}
              />
            )}
          </div>
        </section>

        <section className={SECTION}>
          <h2 className="font-display text-[18px] font-semibold">Where it goes</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {([
              ["Public", "Public feed", "Everyone on Zero Club"],
              ["Club Only", "Club only", "Members of one club"],
            ] as const).map(([value, title, hint]) => (
              <button
                key={value}
                onClick={() => setVisibility(value)}
                aria-pressed={visibility === value}
                className={`rounded-xl p-3 text-left transition ${visibility === value ? "border-2 border-foreground" : "border border-foreground/15 hover:border-foreground/30"}`}
              >
                <p className="text-[15px] font-semibold">{title}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>
              </button>
            ))}
          </div>
          {enrolledBootcamps.length > 0 && (
            <label className="mt-3 flex items-center gap-3 border-t border-border py-3">
              <GraduationCap className="h-5 w-5 shrink-0" />
              <span className="flex-1">
                <span className="block text-[15px] font-medium">Submit to a bootcamp</span>
                <span className="block text-[13px] text-muted-foreground">Your tutor can verify it as proof</span>
              </span>
              <select
                value={selectedBootcampId || ""}
                onChange={(e) => setSelectedBootcampId(e.target.value || null)}
                className="max-w-[150px] truncate bg-transparent text-right text-[14px] font-semibold text-muted-foreground outline-none"
              >
                <option value="">None</option>
                {enrolledBootcamps.map(bc => (
                  <option key={bc.id} value={bc.id}>{bc.title}</option>
                ))}
              </select>
            </label>
          )}
          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-3">
              <UserPlus className="h-5 w-5 shrink-0" />
              <div className="flex-1">
                <p className="text-[15px] font-medium">Collaborators</p>
                <p className="text-[13px] text-muted-foreground">Credit the people who built it with you</p>
              </div>
            </div>
            <div className="mt-2">
              <CollaboratorPicker value={collaborators} onChange={setCollaborators} excludeId={profile?.id} />
            </div>
          </div>
        </section>

        <section className={`${SECTION} flex-1 pb-28 md:flex-none md:pb-4`}>
          <h2 className="font-display text-[18px] font-semibold">Release details</h2>
          <div className="mt-3 grid grid-cols-[110px_minmax(0,1fr)] gap-2.5">
            <label className="block">
              <span className={LABEL}>Version</span>
              <input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="1.0.0" className={FIELD} />
            </label>
            <label className="block">
              <span className={LABEL}>What changed</span>
              <input value={releaseNotes} onChange={(event) => setReleaseNotes(event.target.value)} placeholder="New features, fixes, or improvements" className={FIELD} />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[15px] font-medium">Allow others to use this work</p>
              <p className="text-[13px] text-muted-foreground">Offer usage rights for free or for Coins</p>
            </div>
            <Switch checked={availableForUse} onCheckedChange={setAvailableForUse} />
          </div>
          {availableForUse && (
            <div className="mt-3 grid gap-2.5 border-t border-border pt-3 sm:grid-cols-[minmax(0,1fr)_160px]">
              <label className="block">
                <span className={LABEL}>Rights offered</span>
                <select
                  value={licenseType}
                  onChange={(event) => setLicenseType(event.target.value as typeof licenseType)}
                  className={FIELD}
                >
                  <option value="standard">Standard use</option>
                  <option value="commercial">Commercial use</option>
                  <option value="full_ownership">Full ownership transfer</option>
                </select>
              </label>
              <label className="block">
                <span className={LABEL}>Price</span>
                <div className="relative">
                  <Coins className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="number"
                    min="0"
                    value={licensePrice}
                    onChange={(event) => setLicensePrice(event.target.value)}
                    placeholder="Free"
                    className={`${FIELD} pl-9`}
                  />
                </div>
              </label>
              <p className="text-[13px] leading-relaxed text-muted-foreground sm:col-span-2">
                {licenseType === 'full_ownership'
                  ? 'The buyer receives ownership rights to use and adapt this release as they choose.'
                  : licenseType === 'commercial'
                    ? 'The buyer may use and adapt this release in commercial work while you keep ownership.'
                    : 'The buyer may use and adapt this release in their own work while you keep ownership.'}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const SECTION = "bg-card px-4 py-4 md:rounded-xl md:border md:border-border";
const LABEL = "mb-1.5 block text-[13px] font-semibold text-muted-foreground";
const FIELD = "h-11 w-full rounded-[10px] border border-foreground/15 bg-card px-3 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground/40";
