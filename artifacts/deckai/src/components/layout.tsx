import React from "react";
import { Link, useLocation } from "wouter";
import { Layers, Palette, Library, PlusCircle, Presentation, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Library", icon: Library },
    { href: "/generate", label: "New Deck", icon: PlusCircle },
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/corpus", label: "Corpus", icon: Layers },
    { href: "/brand", label: "Brand", icon: Palette },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="w-64 border-r bg-sidebar flex flex-col">
        <div className="h-14 flex items-center px-6 border-b">
          <Presentation className="h-5 w-5 mr-2 text-primary" />
          <span className="font-semibold text-base tracking-tight">DeckAI</span>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className={cn("mr-3 h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}
