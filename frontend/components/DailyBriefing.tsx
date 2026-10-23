"use client";

import React from "react";
import { DayContext, Plan, Task } from "../lib/types";
import {
  SparklesIcon,
  ClockIcon,
  CalendarIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
} from "./Icons";

interface DailyBriefingProps {
  context: DayContext | null;
  activePlan: Plan | null;
  tasks: Task[];
  currentDate: string;
}

export function DailyBriefing({
  context,
  activePlan,
  tasks,
  currentDate,
}: DailyBriefingProps) {
  const pendingTasks = tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS");
  const urgentOrHighTasks = pendingTasks.filter(
    (t) => t.priority === "URGENT" || t.priority === "HIGH"
  );
  const fixedEvents = context?.fixedEvents || [];

  const workStart = context?.preferences?.workStartTime || "09:00";
  const workEnd = context?.preferences?.workEndTime || "18:00";

  // Compute workload and free slack
  const totalTaskMinutes = pendingTasks.reduce((acc, t) => acc + t.duration, 0);
  const fixedEventMinutes = fixedEvents.reduce((acc, e) => {
    const s = new Date(e.startTime).getTime();
    const eTime = new Date(e.endTime).getTime();
    return acc + Math.round((eTime - s) / 60000);
  }, 0);

  const [sH, sM] = workStart.split(":").map(Number);
  const [eH, eM] = workEnd.split(":").map(Number);
  const totalWorkWindow = (eH * 60 + eM) - (sH * 60 + sM);
  const freeSlackMinutes = Math.max(0, totalWorkWindow - fixedEventMinutes - totalTaskMinutes);

  const formattedDate = new Date(currentDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#101B33] via-[#131D33] to-[#0D1527] border border-[#1F2C4C] p-5 sm:p-6 shadow-md">
      {/* Decorative ambient glow */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 -mb-8 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#1F2C4C]/60 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
              <SparklesIcon className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                Executive Daily Briefing
              </span>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {formattedDate}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center space-x-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                {activePlan ? `Schedule v${activePlan.version} Committed` : "Ready to Plan"}
              </span>
            </span>
          </div>
        </div>

        {/* Narrative & Key Insights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Column 1: Commitments & Fixed Events */}
          <div className="bg-[#0B0F19]/60 border border-[#1F2C4C]/60 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span className="flex items-center space-x-1.5">
                <CalendarIcon className="w-4 h-4 text-indigo-400" />
                <span className="text-white">Fixed Commitments</span>
              </span>
              <span className="text-[10px] text-indigo-300 font-bold">{fixedEvents.length} events</span>
            </div>

            {fixedEvents.length > 0 ? (
              <div className="space-y-1.5">
                {fixedEvents.map((evt) => {
                  const sTime = new Date(evt.startTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  });
                  const eTime = new Date(evt.endTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  });
                  return (
                    <div
                      key={evt.id}
                      className="text-xs p-2 rounded-lg bg-[#131D33] border border-[#1F2C4C] flex items-center justify-between"
                    >
                      <span className="font-medium text-slate-200">{evt.title}</span>
                      <span className="text-[10px] font-mono text-indigo-300">
                        {sTime} – {eTime}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No fixed calendar events anchored for today.</p>
            )}
          </div>

          {/* Column 2: Focus Workload & Priorities */}
          <div className="bg-[#0B0F19]/60 border border-[#1F2C4C]/60 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span className="flex items-center space-x-1.5">
                <ShieldCheckIcon className="w-4 h-4 text-sky-400" />
                <span className="text-white">Priority Workload</span>
              </span>
              <span className="text-[10px] text-sky-300 font-bold">
                {Math.round(totalTaskMinutes / 60)}h {totalTaskMinutes % 60}m total
              </span>
            </div>

            <div className="space-y-1.5">
              {urgentOrHighTasks.slice(0, 2).map((t) => (
                <div
                  key={t.id}
                  className="text-xs p-2 rounded-lg bg-[#131D33] border border-[#1F2C4C] flex items-center justify-between"
                >
                  <span className="font-medium text-slate-200 truncate max-w-[140px]">{t.title}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-amber-500/20 text-amber-300">
                    {t.duration}m
                  </span>
                </div>
              ))}
              {urgentOrHighTasks.length === 0 && (
                <p className="text-xs text-slate-400">All high priority tasks completed!</p>
              )}
            </div>
          </div>

          {/* Column 3: Buffer & Resilience Metrics */}
          <div className="bg-[#0B0F19]/60 border border-[#1F2C4C]/60 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span className="flex items-center space-x-1.5">
                <ClockIcon className="w-4 h-4 text-emerald-400" />
                <span className="text-white">Buffer & Slack</span>
              </span>
              <span className="text-[10px] text-emerald-300 font-bold">
                {Math.floor(freeSlackMinutes / 60)}h {freeSlackMinutes % 60}m free
              </span>
            </div>

            <div className="text-xs text-slate-300 space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Working window:</span>
                <span className="font-mono text-slate-200">{workStart} – {workEnd}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Resilience status:</span>
                <span className="font-semibold text-emerald-400">High (Disruption Safe)</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Active version:</span>
                <span className="font-mono text-sky-300">
                  {activePlan ? `Version ${activePlan.version}` : "Baseline"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
