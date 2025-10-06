"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BarChart3, BrainCircuit, ClipboardList, LogOut, Newspaper, Settings, Sparkles } from "lucide-react";

const navItems = [
  { href: "/overview", label: "概览", icon: BarChart3 },
  { href: "/tasks", label: "任务", icon: ClipboardList },
  { href: "/keywords", label: "关键词", icon: BrainCircuit },
  { href: "/news", label: "新闻", icon: Newspaper },
  { href: "/candidates", label: "候选词根", icon: Sparkles },
  { href: "/settings", label: "设置", icon: Settings },
];

export const DashboardNav = () => {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-2 text-sm">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 transition-all",
              isActive
                ? "bg-white text-black shadow"
                : "bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
            )}
          >
            <Icon size={16} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <Link
        href="/logout"
        prefetch={false}
        className="flex items-center gap-2 rounded-full bg-transparent px-4 py-2 text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        <LogOut size={16} />
        <span>退出</span>
      </Link>
    </nav>
  );
};
