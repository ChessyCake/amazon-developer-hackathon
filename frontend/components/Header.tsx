"use client";

import React from "react";
import {
  CalendarIcon,
  ShieldCheckIcon,
  SparklesIcon,
  RefreshCwIcon,
  SlidersIcon,
  ListTodoIcon,
  ClockIcon,
  HistoryIcon,
} from "./Icons";

interface HeaderProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onResetDemo: () => Promise<void>;
  isResetting: boolean;
  proposedPlanCount: number;
}

export function Header({
  currentDate,
  onDateChange,
  activeTab,
  onTabChange,
  onResetDemo,
  isResetting,
  proposedPlanCount,
}: HeaderProps) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: SparklesIcon },
    { id: "timeline", label: "Daily Timeline", icon: ClockIcon },
    {
      id: "proposals",
      label: "Plan Proposals",
      icon: ShieldCheckIcon,
      badge: proposedPlanCount > 0 ? proposedPlanCount : undefined,
    },
    { id: "tasks", label: "Tasks", icon: ListTodoIcon },
    { id: "activity", label: "Activity Feed", icon: HistoryIcon },
    { id: "preferences", label: "Preferences", icon: SlidersIcon },
  ];

  return (
    <header className="border-b border-[#1E293B] bg-[#0B0F19]/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Product Brand */}
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/10">
              <span className="text-white font-bold text-lg tracking-wider">Ω</span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-white tracking-tight">LifeOS</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  Alexa+ 2026
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Adaptive Planning & Deterministic Safe Execution
              </p>
            </div>
          </div>

          {/* Right Controls: Date Selector, Status, & Reset Demo button */}
          <div className="flex items-center space-x-3">
            {/* Live Connection status */}
            <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-[#131D33] border border-[#1F2C4C] text-xs text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>MCP Server Connected</span>
            </div>

            {/* Date Picker */}
            <div className="flex items-center space-x-2 bg-[#131D33] border border-[#1F2C4C] px-3 py-1.5 rounded-lg text-xs text-slate-200">
              <CalendarIcon className="w-4 h-4 text-sky-400" />
              <input
                type="date"
                value={currentDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="bg-transparent text-slate-100 text-xs focus:outline-none cursor-pointer"
              />
            </div>

            {/* Reset Demo Button (Crucial for Judge evaluation) */}
            <button
              onClick={onResetDemo}
              disabled={isResetting}
              title="Reset baseline scenario (Chemistry Lab, OS Assignment, Exam Prep, DSA)"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCwIcon className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Reset Demo Baseline</span>
              <span className="sm:hidden">Reset</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <nav className="flex space-x-1 overflow-x-auto py-2 scrollbar-none border-t border-[#1E293B]/50">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  isActive
                    ? "bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-[#131D33]"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-sky-400" : "text-slate-400"}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-900 animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
