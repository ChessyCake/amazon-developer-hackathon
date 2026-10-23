"use client";

import React from "react";
import {
  CalendarIcon,
  ShieldCheckIcon,
  SparklesIcon,
  MenuIcon,
  ZapIcon,
} from "./Icons";
import { Plan } from "../lib/types";

interface TopBarProps {
  currentDate: string;
  onDateChange: (date: string) => void;
  activePlan: Plan | null;
  onToggleSidebar: () => void;
  onToggleAssistant: () => void;
  isAssistantOpen: boolean;
  onQuickReplan: (text: string) => void;
  title: string;
  subtitle?: string;
}

export function TopBar({
  currentDate,
  onDateChange,
  activePlan,
  onToggleSidebar,
  onToggleAssistant,
  isAssistantOpen,
  onQuickReplan,
  title,
  subtitle,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 h-16 bg-[#0B0F19]/90 backdrop-blur-md border-b border-[#1F2C4C] px-4 sm:px-6 lg:px-8 flex items-center justify-between">
      {/* Left: Mobile Menu & View Title */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#131D33] border border-[#1F2C4C] lg:hidden transition"
          aria-label="Toggle navigation"
        >
          <MenuIcon className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center space-x-2">
            <span>{title}</span>
            {activePlan && (
              <span className="hidden md:inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheckIcon className="w-3 h-3" />
                <span>Plan v{activePlan.version} Active</span>
              </span>
            )}
          </h1>
          {subtitle && (
            <p className="text-[11px] text-slate-400 hidden sm:block">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right: Date Picker, Quick Disruption, AI Assistant Toggle */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Date Selector */}
        <div className="flex items-center space-x-2 bg-[#131D33] border border-[#1F2C4C] px-3 py-1.5 rounded-xl text-xs text-slate-200">
          <CalendarIcon className="w-4 h-4 text-sky-400 shrink-0" />
          <input
            type="date"
            value={currentDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="bg-transparent text-slate-100 text-xs focus:outline-none cursor-pointer"
          />
        </div>

        {/* Quick Lab Disruption Simulation Button */}
        <button
          onClick={() =>
            onQuickReplan(
              "My lab ran an hour late. Replan my day, but preserve my exam preparation."
            )
          }
          title="Simulate Stage 4 Disruption: Chemistry Lab +60 min delay"
          className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold transition active:scale-95"
        >
          <ZapIcon className="w-3.5 h-3.5 text-amber-400" />
          <span>+60m Lab Overrun</span>
        </button>

        {/* Assistant Toggle Button */}
        <button
          onClick={onToggleAssistant}
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition shadow-sm active:scale-95 ${
            isAssistantOpen
              ? "bg-sky-600 text-white shadow-sky-600/30 border border-sky-400/40"
              : "bg-gradient-to-r from-sky-500/20 to-indigo-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 text-sky-300 border border-sky-500/30"
          }`}
        >
          <SparklesIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {isAssistantOpen ? "Close Assistant" : "AI Assistant"}
          </span>
          <span className="sm:hidden">AI</span>
        </button>
      </div>
    </header>
  );
}
