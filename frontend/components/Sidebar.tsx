"use client";

import React from "react";
import {
  SparklesIcon,
  ClockIcon,
  ShieldCheckIcon,
  ListTodoIcon,
  HistoryIcon,
  SlidersIcon,
  RefreshCwIcon,
  XIcon,
} from "./Icons";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  proposedPlanCount: number;
  onResetDemo: () => Promise<void>;
  isResetting: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({
  activeTab,
  onTabChange,
  proposedPlanCount,
  onResetDemo,
  isResetting,
  isOpen,
  onClose,
}: SidebarProps) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: SparklesIcon, description: "Overview & Daily Briefing" },
    { id: "timeline", label: "Schedule Timeline", icon: ClockIcon, description: "Interactive daily schedule" },
    {
      id: "proposals",
      label: "Plan Proposals",
      icon: ShieldCheckIcon,
      description: "Diff review & version lock",
      badge: proposedPlanCount > 0 ? proposedPlanCount : undefined,
    },
    { id: "tasks", label: "Tasks & Priorities", icon: ListTodoIcon, description: "Task management & filters" },
    { id: "activity", label: "Action History", icon: HistoryIcon, description: "Immutable audit feed" },
    { id: "preferences", label: "Preferences", icon: SlidersIcon, description: "Focus, breaks & work hours" },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-[#0B0F19] border-r border-[#1F2C4C] flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-[#1F2C4C] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-400 via-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 ring-1 ring-white/20">
              <span className="text-white font-extrabold text-xl tracking-wider select-none">Ω</span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg text-white tracking-tight">LifeOS</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  Alexa+
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Autonomous Planning Agent</p>
            </div>
          </div>

          {/* Close button on mobile */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#131D33] lg:hidden transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Navigation
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                  isActive
                    ? "bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-sm shadow-sky-500/5 font-semibold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-[#131D33] border border-transparent"
                }`}
              >
                <div className="flex items-center space-x-3 text-left">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? "text-sky-400" : "text-slate-500 group-hover:text-slate-300"
                    }`}
                  />
                  <div>
                    <div className="leading-tight">{item.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 font-normal">
                      {item.description}
                    </div>
                  </div>
                </div>

                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 shadow-sm animate-pulse">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* System Telemetry & Quick Action */}
        <div className="p-4 border-t border-[#1F2C4C] bg-[#0E1526]/60 space-y-3">
          {/* Status Box */}
          <div className="p-3 rounded-xl bg-[#131D33] border border-[#1F2C4C] text-[11px] space-y-1.5">
            <div className="flex items-center justify-between text-slate-400 font-semibold">
              <span className="flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-200">System Online</span>
              </span>
              <span className="text-[10px] text-slate-500">v1.0.0</span>
            </div>
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Protocol:</span>
              <span className="text-sky-300 font-mono">Streamable HTTP (MCP)</span>
            </div>
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Database:</span>
              <span className="text-emerald-400 font-mono">Neon PostgreSQL</span>
            </div>
            <div className="flex items-center justify-between text-slate-400 text-[10px]">
              <span>Timezone:</span>
              <span className="text-slate-300 font-mono">Asia/Kolkata (+05:30)</span>
            </div>
          </div>

          {/* Seed / Reset Demo Button */}
          <button
            onClick={onResetDemo}
            disabled={isResetting}
            title="Reset to deterministic baseline: Chemistry Lab, OS Assignment, Exam Prep, DSA Practice"
            className="w-full flex items-center justify-center space-x-2 px-3 py-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 active:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition active:scale-98 disabled:opacity-50"
          >
            <RefreshCwIcon className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`} />
            <span>{isResetting ? "Resetting Demo..." : "Reset Demo Baseline"}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
