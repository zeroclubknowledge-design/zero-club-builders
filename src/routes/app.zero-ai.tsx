import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Sparkles, Brain, Rocket, Zap, MessageSquare, Cpu, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/app/zero-ai")({
  component: ZeroAIPage,
});

function ZeroAIPage() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full animate-pulse" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center gap-4 bg-background/50 backdrop-blur-xl border-b border-border/50">
        <button 
          onClick={() => navigate({ to: '/app' })}
          className="grid h-10 w-10 place-items-center rounded-full bg-card border border-border transition active:scale-90"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-display font-bold tracking-tight">Zero AI</h1>
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] text-muted-foreground">Your Private Study Buddy</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 pt-10 pb-20 relative">
        {/* Animated Hero Icon */}
        <div className="flex justify-center mb-10">
          <div className="relative">
            <div className={`h-24 w-24 rounded-[32px] bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-glow transition-all duration-1000 ${mounted ?"scale-100 opacity-100" : "scale-50 opacity-0"}`}>
              <Sparkles className="h-12 w-12 text-white animate-pulse" />
            </div>
            <div className="absolute -inset-4 bg-primary/10 blur-2xl rounded-full -z-10 animate-pulse" />
          </div>
        </div>

        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl font-display font-black tracking-tighter leading-none">
            Your New <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">Personal Study Buddy.</span>
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-[280px] mx-auto">
            Zero AI is like having your smartest friend from class right in your pocket. It's fun, friendly, and always ready to help you crush your bootcamp goals!
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid gap-4 mb-12">
          {[
            { icon: Brain, title: "Smart Help, Zero Stress", desc: "Stuck on a lesson? Zero AI explains things simply, just like a good friend would." },
            { icon: Cpu, title: "Your Coding Partner", desc: "Need a hand with your project? Let's build it together, step-by-step." },
            { icon: MessageSquare, title: "Always Here for You", desc: "Got a question at 3 AM? Your study buddy is always awake and ready to chat." }
          ].map((feat, i) => (
            <div 
              key={i}
              className={`p-5 rounded-3xl bg-card border border-border flex gap-4 transition-all duration-700 ${mounted ?"translate-y-0 opacity-100" : "translate-y-10 opacity-0"}`}
              style={{ transitionDelay: `${i * 150}ms` }}
            >
              <div className="h-12 w-12 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
                <feat.icon className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm">{feat.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{feat.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Coming Soon Section */}
        <div className={`mt-10 p-8 rounded-[40px] bg-gradient-to-b from-primary/5 to-transparent border border-primary/10 text-center relative overflow-hidden transition-all duration-1000 ${mounted ?"scale-100 opacity-100" : "scale-95 opacity-0"}`}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-black text-[10px] rounded-b-xl shadow-glow">
            Status: Getting Ready
          </div>
          
          <h3 className="text-2xl font-display font-black mb-2 mt-4 italic">COMING SOON</h3>
          <p className="text-sm text-primary/80 font-bold mb-6">Your buddy is almost ready to join the class!</p>
        </div>
      </main>

      {/* Bottom Footer */}
      <footer className="px-6 pb-10 text-center">
        <button 
          onClick={() => navigate({ to: '/app' })}
          className="w-full py-4 rounded-2xl bg-card border border-border text-sm font-bold transition active:scale-95 hover:bg-accent"
        >
          Back to Club
        </button>
      </footer>
    </div>
  );
}
