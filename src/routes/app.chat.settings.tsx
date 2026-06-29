import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Bell, Lock, Shield, Ban, Eye } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/app/chat/settings")({
  component: ChatSettingsPage,
});

function ChatSettingsPage() {
  const router = useRouter();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);

  return (
    <div className="flex flex-col min-h-screen bg-background relative">
      {/* High-Fidelity Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border/50 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center gap-3">
        <button onClick={() => router.history.back()} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent/50 transition">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold">Chat Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8">
        
        {/* Notifications */}
        <section className="space-y-4">
          <h2 className="text-xs text-muted-foreground">Notifications</h2>
          <div className="bg-card/50 border border-border/50 rounded-2xl overflow-hidden divide-y divide-border/30">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Push Notifications</h3>
                  <p className="text-xs text-muted-foreground">Receive alerts for new messages</p>
                </div>
              </div>
              <Switch checked={pushEnabled} onCheckedChange={setPushEnabled} />
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section className="space-y-4">
          <h2 className="text-xs text-muted-foreground">Privacy</h2>
          <div className="bg-card/50 border border-border/50 rounded-2xl overflow-hidden divide-y divide-border/30">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <Eye className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Read Receipts</h3>
                  <p className="text-xs text-muted-foreground">Let others know when you've read their messages</p>
                </div>
              </div>
              <Switch checked={readReceipts} onCheckedChange={setReadReceipts} />
            </div>
            
            <button className="flex items-center justify-between w-full p-4 hover:bg-accent/30 transition text-left">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
                  <Ban className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Blocked Users</h3>
                  <p className="text-xs text-muted-foreground">Manage people you've blocked</p>
                </div>
              </div>
              <ChevronLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
            </button>
          </div>
        </section>

        {/* Security */}
        <section className="space-y-4">
          <h2 className="text-xs text-muted-foreground">Security</h2>
          <div className="bg-card/50 border border-border/50 rounded-2xl overflow-hidden divide-y divide-border/30">
            <button className="flex items-center justify-between w-full p-4 hover:bg-accent/30 transition text-left">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">End-to-End Encryption</h3>
                  <p className="text-xs text-muted-foreground">Your messages are secured by Zero Club</p>
                </div>
              </div>
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
