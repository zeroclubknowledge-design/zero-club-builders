import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import React, { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Globe, AppWindow } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function LinkifiedText({ text, className, linkColor = "text-primary font-bold hover:opacity-80" }: { text: string; className?: string, linkColor?: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  if (!text) return null;

  const mentionsMatch = text.match(/@[a-zA-Z0-9_-]+/g) || [];
  const uniqueUsernames = Array.from(new Set(mentionsMatch.map((m) => m.substring(1).toLowerCase())));

  const { data: mentionedProfiles } = useQuery({
    queryKey: ['mentionedProfiles', uniqueUsernames.join(',')],
    queryFn: async () => {
      if (uniqueUsernames.length === 0) return [];
      const { data } = await supabase
        .from('profiles')
        .select('username, full_name')
        .in('username', uniqueUsernames);
      return data || [];
    },
    enabled: uniqueUsernames.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  const profileMap = Object.fromEntries(
    (mentionedProfiles || []).map((p) => [p.username?.toLowerCase(), p.full_name])
  );

  // Match URLs, @mentions, and markdown bold (**text** or *text*), supporting newlines
  const regex = /(@[a-zA-Z0-9_-]+|https?:\/\/[^\s]+|www\.[^\s]+|\*\*[\s\S]*?\*\*|\*[\s\S]*?\*)/g;
  const parts = text.split(regex);

  const handleLinkClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const url = new URL(href);
      const isInternalPath = url.pathname.startsWith('/app/') || url.pathname.startsWith('/signin') || url.pathname.startsWith('/signup');
      const isSameHost = url.hostname === window.location.hostname;
      
      // If it looks like an internal link, prompt the user
      if (isInternalPath || isSameHost) {
        setSelectedUrl(href);
      } else {
        // External link, just open it
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    } catch {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  const handleOpenInternal = () => {
    if (selectedUrl) {
      try {
        const url = new URL(selectedUrl);
        router.history.push(url.pathname + url.search + url.hash);
      } catch {
        window.location.href = selectedUrl;
      }
      setSelectedUrl(null);
    }
  };

  const handleOpenExternal = () => {
    if (selectedUrl) {
      window.open(selectedUrl, '_blank', 'noopener,noreferrer');
      setSelectedUrl(null);
    }
  };

  const isHtml = /<[a-z][\s\S]*>/i.test(text);

  if (isHtml) {
    const handleClick = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Handle mentions
      const username = target.dataset.username;
      if (username) {
        e.preventDefault();
        e.stopPropagation();
        router.navigate({ to: '/app/profile/$id', params: { id: username } });
        return;
      } else if (target.textContent?.startsWith('@') && (target.classList.contains('text-primary') || target.tagName === 'STRONG' || target.tagName === 'SPAN')) {
        e.preventDefault();
        e.stopPropagation();
        router.navigate({ to: '/app/profile/$id', params: { id: target.textContent.substring(1) } });
        return;
      }

      // Handle auto-linkified links
      if (target.tagName === 'A') {
        const href = (target as HTMLAnchorElement).href;
        handleLinkClick(e, href);
      }
    };

    // Auto-linkify raw URLs outside of tags
    let htmlContent = text.replace(
      /(?<!href=["'])(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, 
      match => `<a href="${match.startsWith('www.') ? 'https://'+match : match}" class="${linkColor} break-all font-semibold cursor-pointer">${match}</a>`
    );

    // Auto-linkify manually typed @mentions outside of existing styled tags
    htmlContent = htmlContent.replace(
      /(?<!["'a-zA-Z0-9_-])(@[a-zA-Z0-9_-]+)(?![a-zA-Z0-9_-])/g,
      match => {
        const username = match.substring(1);
        const displayName = profileMap[username.toLowerCase()] || match;
        return `<strong class="${linkColor} cursor-pointer" data-username="${username}">${displayName}</strong>`;
      }
    );

    // Fallback parser to remove asterisks and render bold for text containing literal asterisks
    htmlContent = htmlContent.replace(/\*\*([\s\S]*?)\*\*/g, '<strong class="font-black">$1</strong>');
    htmlContent = htmlContent.replace(/(?<!\*)\*(?!\*)([\s\S]*?)(?<!\*)\*(?!\*)/g, '<strong class="font-bold">$1</strong>');

    // Clean up excessive newlines around HTML blocks caused by previous **Title**\n\n<p> formatting
    htmlContent = htmlContent.replace(/\n+(?=<p>|<p |<div>|<div |<h1>|<h1 |<h2>|<h2 |<h3>|<h3 |<h4>|<h4 |<h5>|<h5 |<h6>|<h6 |<ul>|<ul |<ol>|<ol |<li>|<li |<blockquote>|<blockquote |<pre>|<pre |<hr>|<hr |<br>|<br |<table>|<table )/gi, '');
    htmlContent = htmlContent.replace(/(<\/p>|<\/div>|<\/h1>|<\/h2>|<\/h3>|<\/h4>|<\/h5>|<\/h6>|<\/ul>|<\/ol>|<\/li>|<\/blockquote>|<\/pre>|<\/hr>|<\/br>|<\/table>)\n+/gi, '$1');

    return (
      <>
        <div 
          className={`prose dark:prose-invert max-w-none text-foreground prose-p:leading-relaxed prose-pre:p-0 whitespace-pre-wrap ${className ||''}`} 
          dangerouslySetInnerHTML={{ __html: htmlContent }}
          onClick={handleClick}
        />
        <Drawer open={!!selectedUrl} onOpenChange={(open) => !open && setSelectedUrl(null)}>
          <DrawerContent className="border-none bg-background p-6">
            <DrawerHeader className="text-left mb-6 p-0">
              <DrawerTitle className="text-xl font-black tracking-tight">Open Link</DrawerTitle>
              <DrawerDescription className="text-sm font-medium mt-1">
                This looks like an internal app link. How would you like to open it?
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleOpenInternal}
                className="w-full flex items-center justify-start px-4 gap-4 h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-base hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20"
              >
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <AppWindow className="h-4 w-4" />
                </div>
                Open inside the app
              </button>
              <button 
                onClick={handleOpenExternal}
                className="w-full flex items-center justify-start px-4 gap-4 h-14 rounded-2xl border-2 border-border/50 font-bold text-base hover:bg-accent/50 active:scale-95 transition-all"
              >
                <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                  <Globe className="h-4 w-4 text-foreground" />
                </div>
                Open in external browser
              </button>
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      <span className={className}>
        {parts.map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            return <strong key={i} className="font-black">{part.slice(2, -2)}</strong>;
          } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2 && !part.startsWith("**")) {
            return <strong key={i} className="font-bold">{part.slice(1, -1)}</strong>;
          } else if (part.startsWith("@")) {
            const username = part.substring(1);
            const displayName = profileMap[username.toLowerCase()] || part;
            return (
              <Link 
                key={i} 
                to="/app/profile/$id" 
                params={{ id: username }} 
                className={`${linkColor} font-bold`}
                onClick={(e) => e.stopPropagation()}
              >
                {displayName}
              </Link>
            );
          } else if (part.match(/^https?:\/\//) || part.match(/^www\./)) {
            const href = part.startsWith("www.") ? `https://${part}` : part;
            return (
              <a 
                key={i} 
                href={href} 
                className={`${linkColor} break-all font-semibold cursor-pointer`}
                onClick={(e) => handleLinkClick(e, href)}
              >
                {part}
              </a>
            );
          }
          return (
            <span key={i}>
              {part.split('\n').map((line, j, arr) => (
                <React.Fragment key={j}>
                  {line}
                  {j < arr.length - 1 && <br />}
                </React.Fragment>
              ))}
            </span>
          );
        })}
      </span>

      <Drawer open={!!selectedUrl} onOpenChange={(open) => !open && setSelectedUrl(null)}>
        <DrawerContent className="border-none bg-background p-6">
          <DrawerHeader className="text-left mb-6 p-0">
            <DrawerTitle className="text-xl font-black tracking-tight">Open Link</DrawerTitle>
            <DrawerDescription className="text-sm font-medium mt-1">
              This looks like an internal app link. How would you like to open it?
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-3">
            <button 
              onClick={handleOpenInternal}
              className="w-full flex items-center justify-start px-4 gap-4 h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-base hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20"
            >
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <AppWindow className="h-4 w-4" />
              </div>
              Open inside the app
            </button>
            <button 
              onClick={handleOpenExternal}
              className="w-full flex items-center justify-start px-4 gap-4 h-14 rounded-2xl border-2 border-border/50 font-bold text-base hover:bg-accent/50 active:scale-95 transition-all"
            >
              <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                <Globe className="h-4 w-4 text-foreground" />
              </div>
              Open in external browser
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
