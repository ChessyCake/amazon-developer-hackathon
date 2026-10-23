"use client";

import React from "react";
import { DayContext, Plan, Task } from "../lib/types";
import {
  ClockIcon,
  CalendarIcon,
  ShieldCheckIcon,
  SparklesIcon,
  CheckCircleIcon,
  LockIcon,
  CoffeeIcon,
  ZapIcon,
} from "./Icons";
import { DailyBriefing } from "./DailyBriefing";

interface DashboardProps {
  context: DayContext | null;
  activePlan: Plan | null;
  tasks: Task[];
  currentDate: string;
  onQuickReplan: (text: string) => void;
  onOpenTimeline: () => void;
  onCompleteTask: (taskId: string) => void;
}

export function Dashboard({
  context,
  activePlan,
  tasks,
  currentDate,
  onQuickReplan,
  onOpenTimeline,
  onCompleteTask,
}: DashboardProps) {
  const pendingTasks = tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS");
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED");

  const totalTaskMinutes = pendingTasks.reduce((acc, t) => acc + t.duration, 0);
  const fixedEvents = context?.fixedEvents || [];
  const fixedEventMinutes = fixedEvents.reduce((acc, e) => {
    const s = new Date(e.startTime).getTime();
    const eTime = new Date(e.endTime).getTime();
    return acc + Math.round((eTime - s) / 60000);
  }, 0);

  const workStart = context?.preferences?.workStartTime || "09:00";
  const workEnd = context?.preferences?.workEndTime || "18:00";

  // Calculate free time remaining
  const [sH, sM] = workStart.split(":").map(Number);
  const [eH, eM] = workEnd.split(":").map(Number);
  const totalWorkWindow = (eH * 60 + eM) - (sH * 60 + sM);
  const freeMinutesRemaining = Math.max(0, totalWorkWindow - fixedEventMinutes - totalTaskMinutes);

  return (
    <div className="space-y-6">
      {/* 1. Daily Executive Briefing */}
      <DailyBriefing
        context={context}
        activePlan={activePlan}
        tasks={tasks}
        currentDate={currentDate}
      />

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Schedule Status */}
        <div className="bg-[#131D33] border border-[#1F2C4C] rounded-2xl p-4 shadow-sm relative overflow-hidden group hover:border-sky-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Current Schedule</span>
            <ShieldCheckIcon className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-extrabold text-white">
              {activePlan ? `Version ${activePlan.version}` : "Draft"}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                activePlan?.status === "ACTIVE"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-700 text-slate-300"
              }`}
            >
              {activePlan?.status || "NO PLAN"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {activePlan ? `${activePlan.items.length} scheduled items active` : "Generate or seed baseline"}
          </p>
        </div>

        {/* Card 2: Free Focus Time Window */}
        <div className="bg-[#131D33] border border-[#1F2C4C] rounded-2xl p-4 shadow-sm group hover:border-emerald-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Available Free Slack</span>
            <ClockIcon className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-extrabold text-white">
              {Math.floor(freeMinutesRemaining / 60)}h {freeMinutesRemaining % 60}m
            </span>
            <span className="text-xs text-slate-400">slack window</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Window: {workStart} – {workEnd} ({Math.round(totalWorkWindow / 60)}h)
          </p>
        </div>

        {/* Card 3: Pending Tasks */}
        <div className="bg-[#131D33] border border-[#1F2C4C] rounded-2xl p-4 shadow-sm group hover:border-amber-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Pending Tasks</span>
            <SparklesIcon className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-extrabold text-white">{pendingTasks.length}</span>
            <span className="text-xs text-slate-400">
              ({Math.round(totalTaskMinutes / 60)}h {totalTaskMinutes % 60}m work)
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {completedTasks.length} completed today
          </p>
        </div>

        {/* Card 4: Fixed Calendar Events */}
        <div className="bg-[#131D33] border border-[#1F2C4C] rounded-2xl p-4 shadow-sm group hover:border-indigo-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Fixed Anchor Events</span>
            <LockIcon className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-extrabold text-white">{fixedEvents.length}</span>
            <span className="text-xs text-slate-400">
              ({Math.round(fixedEventMinutes / 60)}h {fixedEventMinutes % 60}m locked)
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Anchor calendar blocks</p>
        </div>
      </div>

      {/* 3. Rehearsed Demo Disruption Banner */}
      <div className="bg-gradient-to-r from-sky-950/70 via-indigo-950/70 to-slate-900 border border-sky-600/40 rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center space-x-1 text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                <ZapIcon className="w-3 h-3 text-sky-400" />
                <span>Rehearsed Hackathon Demonstration</span>
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white mt-1">
              Simulate Schedule Disruption: "Chemistry Lab Ran 1 Hour Late"
            </h3>
            <p className="text-xs text-slate-300 max-w-2xl">
              Demonstrates LifeOS Stage 4 Disruption Replanning: Extends the fixed Chemistry Lab from 12:00 to 13:00 IST, deterministically moves conflicting tasks, preserves Exam Preparation, and presents a structured diff for explicit user approval before database commit.
            </p>
          </div>

          <div className="flex items-center space-x-2.5 shrink-0">
            <button
              onClick={() =>
                onQuickReplan(
                  "My lab ran an hour late. Replan my day, but preserve my exam preparation."
                )
              }
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-bold transition shadow-md shadow-sky-600/25 flex items-center space-x-2 active:scale-95"
            >
              <span>Trigger Disruption Replan</span>
              <span>→</span>
            </button>
            <button
              onClick={onOpenTimeline}
              className="px-3.5 py-2.5 rounded-xl bg-[#131D33] hover:bg-[#1E293B] text-slate-200 border border-[#1F2C4C] text-xs font-semibold transition"
            >
              View Timeline
            </button>
          </div>
        </div>
      </div>

      {/* 4. Main 2-Column Split: Task Summary & Schedule Timeline Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Task Summary & Completion */}
        <div className="bg-[#131D33] border border-[#1F2C4C] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#1F2C4C] pb-3">
            <div className="flex items-center space-x-2">
              <SparklesIcon className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Today's Priority Tasks
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {pendingTasks.length} pending • {completedTasks.length} completed
            </span>
          </div>

          {pendingTasks.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              All tasks completed for today!
            </div>
          ) : (
            <div className="space-y-2.5">
              {pendingTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-[#0B0F19]/70 border border-[#1F2C4C] hover:border-sky-500/40 transition group"
                >
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => onCompleteTask(task.id)}
                      className="text-slate-500 hover:text-emerald-400 transition"
                      title="Mark task completed"
                    >
                      <CheckCircleIcon className="w-5 h-5" />
                    </button>
                    <div>
                      <div className="text-xs font-bold text-slate-100 group-hover:text-white transition">
                        {task.title}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
                        <span className="text-sky-300 font-medium">{task.duration} mins</span>
                        {task.tags && task.tags.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-slate-500">{task.tags.join(", ")}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        task.priority === "URGENT"
                          ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                          : task.priority === "HIGH"
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          : task.priority === "MEDIUM"
                          ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                          : "bg-slate-700/50 text-slate-400"
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Schedule Timeline Preview */}
        <div className="bg-[#131D33] border border-[#1F2C4C] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#1F2C4C] pb-3">
            <div className="flex items-center space-x-2">
              <ClockIcon className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Committed Schedule Timeline
              </h2>
            </div>
            {activePlan && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                Version {activePlan.version}
              </span>
            )}
          </div>

          {activePlan && activePlan.items.length > 0 ? (
            <div className="space-y-2">
              {activePlan.items.map((item) => {
                const sTime = new Date(item.startTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Kolkata",
                });
                const eTime = new Date(item.endTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Kolkata",
                });

                const isFixed = item.itemType === "EVENT";
                const isBreak = item.itemType === "BREAK";
                const duration = Math.round(
                  (new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 60000
                );

                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs transition ${
                      isFixed
                        ? "bg-indigo-950/40 border-indigo-500/30 text-indigo-200"
                        : isBreak
                        ? "bg-emerald-950/20 border-emerald-500/20 text-emerald-300"
                        : "bg-[#0B0F19]/80 border-[#1F2C4C] text-slate-200"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      {isFixed ? (
                        <LockIcon className="w-4 h-4 text-indigo-400 shrink-0" />
                      ) : isBreak ? (
                        <CoffeeIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <ClockIcon className="w-4 h-4 text-sky-400 shrink-0" />
                      )}
                      <div>
                        <div className="font-semibold">{item.title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {duration} mins
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono text-[11px] font-medium text-slate-300">
                      {sTime} – {eTime}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400 text-xs">
              No active schedule committed. Click "Reset Demo Baseline" in the sidebar to populate the schedule.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
