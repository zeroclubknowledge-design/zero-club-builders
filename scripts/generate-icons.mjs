/**
 * Generates src/components/icons/glyphs.tsx and src/components/icons/nav.tsx.
 *
 *   node scripts/generate-icons.mjs
 *
 * The app's icons are Phosphor (regular for the resting state, fill for the
 * active one). The export names match the Lucide names the app was first
 * written against, so call sites never change when the family does.
 *
 * Two glyphs are not Phosphor: the Home and Learn tab icons are Solar and are
 * kept exactly as they were, by decision. They live below as literal markup.
 *
 * Icons: Phosphor by Helena Zhang and Tobias Fried, MIT (https://phosphoricons.com).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "node_modules/@phosphor-icons/core/assets");

function body(weight, name) {
  const file = join(assets, weight, weight === "regular" ? `${name}.svg` : `${name}-${weight}.svg`);
  const svg = readFileSync(file, "utf8");
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
}

/* Lucide name the app uses → Phosphor name. */
const GLYPHS = {
  Accessibility: "person-arms-spread", Activity: "pulse", AlertCircle: "warning-circle", AppWindow: "app-window",
  ArrowDownLeft: "arrow-down-left", ArrowLeft: "arrow-left", ArrowRight: "arrow-right", ArrowUpFromLine: "arrow-line-up",
  ArrowUpRight: "arrow-up-right", AtSign: "at", Award: "medal", BadgeCheck: "seal-check", Ban: "prohibit",
  Banknote: "money", BarChart3: "chart-bar", Bell: "bell", BellOff: "bell-slash", BellRing: "bell-ringing",
  Bold: "text-b", BookOpen: "book-open", BookOpenCheck: "book-open-text", Bookmark: "bookmark-simple", Bot: "robot",
  Brain: "brain", BriefcaseBusiness: "briefcase", Brush: "paint-brush", Building2: "buildings", Calendar: "calendar-blank",
  CalendarClock: "calendar-dots", CalendarDays: "calendar", Camera: "camera", CheckCheck: "checks",
  CheckCircle2: "check-circle", ChevronDown: "caret-down", ChevronDownIcon: "caret-down", ChevronLeft: "caret-left",
  ChevronLeftIcon: "caret-left", ChevronRight: "caret-right", ChevronRightIcon: "caret-right", ChevronUp: "caret-up",
  CircleDollarSign: "currency-circle-dollar", ClipboardCheck: "clipboard-text", ClipboardList: "clipboard",
  Clock: "clock", Clock3: "clock", Code: "code", Coins: "coins", Compass: "compass", Copy: "copy",
  CreditCard: "credit-card", Crop: "crop", Crown: "crown", DollarSign: "currency-dollar", Download: "download-simple",
  Edit3: "pencil-simple-line", Eraser: "eraser", Expand: "arrows-out", ExternalLink: "arrow-square-out", Eye: "eye",
  EyeOff: "eye-slash", File: "file", FileArchive: "file-zip", FileStack: "files", FileText: "file-text",
  FileVideo: "file-video", FileWarning: "file-x", Film: "film-strip", Filter: "funnel-simple", Flag: "flag",
  Flame: "fire", Gamepad2: "game-controller", Gift: "gift", GitBranch: "git-branch", Globe: "globe-simple",
  GraduationCap: "graduation-cap", GripVertical: "dots-six-vertical", HandCoins: "hand-coins", Hash: "hash",
  Heading1: "text-h-one", Heading2: "text-h-two", Headphones: "headphones", Heart: "heart", HeartPulse: "heartbeat",
  HelpCircle: "question", History: "clock-counter-clockwise", Image: "image", Info: "info", Italic: "text-italic",
  Key: "key", KeyRound: "key", Landmark: "bank", Languages: "translate", Layers3: "stack", Layout: "layout",
  LayoutDashboard: "squares-four", LayoutGrid: "grid-four", LifeBuoy: "lifebuoy", Link: "link-simple", Link2: "link",
  LinkIcon: "link-simple", List: "list-bullets", ListChecks: "list-checks", ListOrdered: "list-numbers",
  Loader2: "circle-notch", LoaderCircle: "circle-notch", Lock: "lock-simple", LockKeyhole: "lock-key",
  LogIn: "sign-in", LogOut: "sign-out", Mail: "envelope-simple", MapPin: "map-pin", Maximize: "corners-out",
  Maximize2: "arrows-out-simple", Medal: "medal-military", Megaphone: "megaphone", Menu: "list",
  MessageCircle: "chat-circle", MessageSquare: "chat-teardrop", MessageSquarePlus: "chat-teardrop-dots",
  MessageSquareText: "chat-teardrop-text", Mic: "microphone", Mic2: "microphone-stage", MicOff: "microphone-slash",
  Minimize2: "arrows-in-simple", MonitorOff: "monitor", MonitorUp: "screencast", Moon: "moon",
  MoreHorizontal: "dots-three", MoreVertical: "dots-three-vertical", NotebookPen: "notebook", PackageOpen: "package",
  PackagePlus: "package", Palette: "palette", PanelLeft: "sidebar-simple", Paperclip: "paperclip", Pause: "pause",
  Pen: "pen", PenLine: "pencil-line", Pencil: "pencil-simple", Phone: "phone", PhoneOff: "phone-disconnect",
  Pin: "push-pin", Play: "play", PlayCircle: "play-circle", PlusCircle: "plus-circle", Quote: "quotes",
  Radio: "broadcast", Receipt: "receipt", Redo2: "arrow-arc-right", RefreshCw: "arrows-clockwise", Repeat: "repeat",
  Repeat2: "repeat", Reply: "arrow-bend-up-left", Rocket: "rocket-launch", RotateCcw: "arrow-counter-clockwise",
  RotateCw: "arrow-clockwise", Save: "floppy-disk", Scissors: "scissors", Search: "magnifying-glass",
  Send: "paper-plane-tilt", Settings: "gear-six", Settings2: "gear", Share2: "share-network", Shield: "shield",
  ShieldAlert: "shield-warning", ShieldCheck: "shield-check", ShieldOff: "shield-slash", ShoppingBag: "shopping-bag",
  Shrink: "arrows-in", Sliders: "sliders", SlidersHorizontal: "sliders-horizontal", Smartphone: "device-mobile",
  Smile: "smiley", Sparkles: "sparkle", Star: "star", StopCircle: "stop-circle", Store: "storefront", Sun: "sun",
  Tag: "tag", Target: "target", ThumbsDown: "thumbs-down", ThumbsUp: "thumbs-up", TicketPercent: "ticket",
  Trash: "trash", Trash2: "trash-simple", TrendingUp: "trend-up", Trophy: "trophy", Type: "text-t",
  Undo2: "arrow-arc-left", UploadCloud: "cloud-arrow-up", User: "user", UserMinus: "user-minus", UserPlus: "user-plus",
  UserRound: "user-circle", UserRoundPlus: "user-circle-plus", UserX: "user-circle-minus", Users: "users",
  UsersRound: "users-three", Video: "video-camera", VideoOff: "video-camera-slash", Volume2: "speaker-high",
  VolumeX: "speaker-x", Wallet: "wallet", WalletCards: "cards", Wand2: "magic-wand", Zap: "lightning",
  Check: "check", X: "x", Plus: "plus", Minus: "minus", Circle: "circle", Square: "square",
};

/* Tab and menu icons: regular when idle, fill when that page is open. */
const NAV = {
  IconClubs: "users-three", IconPost: "plus-square", IconWallet: "wallet", IconMessages: "chat-circle-dots",
  IconGames: "game-controller", IconProfile: "user", IconGem: "diamond", IconBookmark: "bookmark-simple",
  IconNotes: "notebook", IconCompass: "compass", IconMetrics: "chart-bar", IconPresentation: "presentation-chart",
  IconStore: "storefront", IconInstitution: "buildings", IconBell: "bell", IconRocket: "rocket-launch",
  IconSpark: "sparkle", IconMenu: "list", IconShield: "shield-check",
};

/* Solar, kept as they were. */
const SOLAR_HOME = ["<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M2 12.2039C2 9.91549 2 8.77128 2.5192 7.82274C3.0384 6.87421 3.98695 6.28551 5.88403 5.10813L7.88403 3.86687C9.88939 2.62229 10.8921 2 12 2C13.1079 2 14.1106 2.62229 16.116 3.86687L18.116 5.10812C20.0131 6.28551 20.9616 6.87421 21.4808 7.82274C22 8.77128 22 9.91549 22 12.2039V13.725C22 17.6258 22 19.5763 20.8284 20.7881C19.6569 22 17.7712 22 14 22H10C6.22876 22 4.34315 22 3.17157 20.7881C2 19.5763 2 17.6258 2 13.725V12.2039Z\"/><path stroke-linecap=\"round\" d=\"M12 15L12 18\"/></g>", "<path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"M2.5192 7.82274C2 8.77128 2 9.91549 2 12.2039V13.725C2 17.6258 2 19.5763 3.17157 20.7881C4.34315 22 6.22876 22 10 22H14C17.7712 22 19.6569 22 20.8284 20.7881C22 19.5763 22 17.6258 22 13.725V12.2039C22 9.91549 22 8.77128 21.4808 7.82274C20.9616 6.87421 20.0131 6.28551 18.116 5.10812L16.116 3.86687C14.1106 2.62229 13.1079 2 12 2C10.8921 2 9.88939 2.62229 7.88403 3.86687L5.88403 5.10813C3.98695 6.28551 3.0384 6.87421 2.5192 7.82274ZM11.25 18C11.25 18.4142 11.5858 18.75 12 18.75C12.4142 18.75 12.75 18.4142 12.75 18V15C12.75 14.5858 12.4142 14.25 12 14.25C11.5858 14.25 11.25 14.5858 11.25 15V18Z\" clip-rule=\"evenodd\"/>"];
const SOLAR_LEARN = ["<g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M9.78272 3.49965C11.2037 2.83345 12.7962 2.83345 14.2172 3.49965L20.9084 6.63664C22.3639 7.31899 22.3639 9.68105 20.9084 10.3634L14.2173 13.5004C12.7963 14.1665 11.2038 14.1665 9.78281 13.5004L3.0916 10.3634C1.63613 9.68101 1.63614 7.31895 3.0916 6.63659L9.78272 3.49965Z\"/><path stroke-linecap=\"round\" d=\"M2 8.5V14\"/><path stroke-linecap=\"round\" d=\"M19 11.5V16.6254C19 17.6334 18.4965 18.5772 17.6147 19.0656C16.1463 19.8787 13.796 21 12 21C10.204 21 7.8537 19.8787 6.38533 19.0656C5.5035 18.5772 5 17.6334 5 16.6254V11.5\"/></g>", "<g fill=\"currentColor\"><path d=\"M14.2172 3.49965C12.7962 2.83345 11.2037 2.83345 9.78272 3.49965L3.0916 6.63659C2.0156 7.14105 1.73507 8.56352 2.25 9.54666L2.25 14.5C2.25 14.9142 2.58579 15.25 3 15.25C3.41421 15.25 3.75 14.9142 3.75 14.5V10.672L9.78281 13.5003C11.2038 14.1665 12.7963 14.1665 14.2173 13.5003L20.9084 10.3634C22.3639 9.68105 22.3639 7.31899 20.9084 6.63664L14.2172 3.49965Z\"/><path d=\"M5 12.9147V16.6254C5 17.6334 5.5035 18.5772 6.38533 19.0656C7.8537 19.8787 10.204 21 12 21C13.796 21 16.1463 19.8787 17.6147 19.0656C18.4965 18.5772 19 17.6334 19 16.6254V12.9148L14.854 14.8585C13.0296 15.7138 10.9705 15.7138 9.14607 14.8585L5 12.9147Z\"/></g>"];

const q = (s) => "`" + s.replace(/`/g, "\\`") + "`";

const glyphs = `/**
 * Zero Club icon set — Phosphor, regular weight.
 *
 * An icon whose className sets a fill colour (fill-current, fill-primary, …)
 * draws the solid Phosphor weight instead, so liked, saved and selected
 * states read as filled without every call site choosing a second icon.
 *
 * Export names match the Lucide names the app was first written against, so
 * changing family is one regeneration of this file.
 *
 * Icons: Phosphor, MIT (https://phosphoricons.com).
 * Generated by scripts/generate-icons.mjs — edit the generator, not this.
 */
import React from "react";

export type ZeroIconProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string;
  /** Accepted and ignored: Phosphor glyphs are filled outlines, not strokes. */
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
};

/** Kept for call sites that typed a prop as \`LucideIcon\`. */
export type LucideIcon = React.FC<ZeroIconProps>;

const SOLID = /(^|\\s)fill-/;

function make(regular: string, solid: string): LucideIcon {
  return function ZeroIcon({ size, strokeWidth, absoluteStrokeWidth, className, ...rest }: ZeroIconProps) {
    return (
      <svg
        viewBox="0 0 256 256"
        width={size ?? 24}
        height={size ?? 24}
        fill="currentColor"
        aria-hidden="true"
        className={className ? \`zc-icon \${className}\` : "zc-icon"}
        {...rest}
        dangerouslySetInnerHTML={{ __html: className && SOLID.test(className) ? solid : regular }}
      />
    );
  };
}

${Object.entries(GLYPHS).map(([k, n]) => `export const ${k} = make(${q(body("regular", n))}, ${q(body("fill", n))});`).join("\n")}
`;

const nav = `/**
 * Zero Club navigation icons — regular when idle, fill when that page is open.
 *
 * Phosphor, except Home and Learn, which stay Solar by decision.
 *
 * Icons: Phosphor, MIT. Home and Learn: Solar by 480 Design, CC BY 4.0.
 * Generated by scripts/generate-icons.mjs — edit the generator, not this.
 */
import React from "react";

export interface ZeroIconProps {
  className?: string;
  active?: boolean;
}

function make(idle: string, solid: string, viewBox = "0 0 256 256") {
  return function NavIcon({ className, active }: ZeroIconProps) {
    return (
      <svg
        viewBox={viewBox}
        className={className ? \`zc-icon \${className}\` : "zc-icon"}
        fill={active ? "currentColor" : viewBox === "0 0 24 24" ? "none" : "currentColor"}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: active ? solid : idle }}
      />
    );
  };
}

export const IconHome = make(${q(SOLAR_HOME[0])}, ${q(SOLAR_HOME[1])}, "0 0 24 24");
export const IconLearn = make(${q(SOLAR_LEARN[0])}, ${q(SOLAR_LEARN[1])}, "0 0 24 24");
${Object.entries(NAV).map(([k, n]) => `export const ${k} = make(${q(body("regular", n))}, ${q(body("fill", n))});`).join("\n")}
`;

writeFileSync(join(root, "src/components/icons/glyphs.tsx"), glyphs);
writeFileSync(join(root, "src/components/icons/nav.tsx"), nav);
console.log(`${Object.keys(GLYPHS).length} glyphs, ${Object.keys(NAV).length + 2} nav icons`);
