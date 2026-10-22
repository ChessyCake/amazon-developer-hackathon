"use client";

import React from "react";
import { DayContext, Plan, Task } from "../lib/types";
import {
  ClockIcon,
  CalendarIcon,
  ShieldCheckIcon,
  SparklesIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  LockIcon,
} from "./Icons";

interface DashboardProps {
  context: DayContext | null;
  activePlan: Plan | null;
  tasks: Task[];
  onQuickReplan: (text: string) => void;
  onOpenTimeline: () => void;
  onCompleteTask: (taskId: string) => void;
}

export function Dashboard({
  context,
  activePlan,
  tasks,
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

  // Calculate rough available free time
  const [sH, sM] = workStart.split(":").map(Number);
  const [eH, eM] = workEnd.split(":").map(Number);
  const totalWorkWindow = (eH * 60 + eM) - (sH * 60 + sM);
  const freeMinutesRemaining = Math.max(0, totalWorkWindow - fixedEventMinutes - totalTaskMinutes);

  return (
    <div className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Plan Status */}
        <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Current Schedule</span>
            <ShieldCheckIcon className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white">
              {activePlan ? `Version ${activePlan.version}` : "Draft"}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                activePlan?.status === "ACTIVE"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-slate-700 text-slate-300"
              }`}
            >
              {activePlan?.status || "NO PLAN"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {activePlan ? `${activePlan.items.length} scheduled items` : "Generate or seed baseline"}
          </p>
        </div>

        {/* Card 2: Available Focus Time */}
        <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Available Free Time</span>
            <ClockIcon className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white">
              {Math.floor(freeMinutesRemaining / 60)}h {freeMinutesRemaining % 60}m
            </span>
            <span className="text-xs text-slate-400">free window</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Window: {workStart} - {workEnd} ({Math.round(totalWorkWindow / 60)}h)
          </p>
        </div>

        {/* Card 3: Pending Tasks */}
        <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Pending Tasks</span>
            <SparklesIcon className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white">{pendingTasks.length}</span>
            <span className="text-xs text-slate-400">
              ({Math.round(totalTaskMinutes / 60)}h {totalTaskMinutes % 60}m workload)
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {completedTasks.length} completed today
          </p>
        </div>

        {/* Card 4: Fixed Calendar Events */}
        <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Fixed Events</span>
            <LockIcon className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white">{fixedEvents.length}</span>
            <span className="text-xs text-slate-400">
              ({Math.round(fixedEventMinutes / 60)}h {fixedEventMinutes % 60}m committed)
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Anchor calendar blocks</p>
        </div>
      </div>

      {/* Main 2-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Today's Priorities & Active Plan Timeline Preview */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Scenario Banner for Judges */}
          <div className="bg-gradient-to-r from-sky-950/60 to-indigo-950/60 border border-sky-800/40 rounded-xl p-4 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Stage 4 Demonstration Scenario
                </span>
                <h3 className="text-sm font-semibold text-white mt-1">
                  Schedule Disruption: "My lab ran an hour late"
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Simulate the hackathon replanning flow: Chemistry Lab is extended by 60 minutes while preserving Exam Preparation.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  onQuickReplan(
                    "My lab ran an hour late. Replan my day, but preserve my exam preparation."
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition shadow-sm flex items-center space-x-1.5"
              >
                <span>Trigger Lab Delay Replan</span>
                <span className="text-sky-200">→</span>
              </button>
              <button
                onClick={onOpenTimeline}
                className="px-3 py-1.5 rounded-lg bg-[#131D33] hover:bg-[#1E293B] text-slate-200 border border-[#1F2C4C] text-xs font-medium transition"
              >
                View Full Timeline
              </button>
            </div>
          </div>

          {/* Today's Priorities & Tasks */}
          <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <SparklesIcon className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Today's Priority Tasks
                </h2>
              </div>
              <span className="text-xs text-slate-400">
                {pendingTasks.length} pending
              </span>
            </div>

            {pendingTasks.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                No pending tasks for today. You're completely caught up!
              </div>
            ) : (
              <div className="space-y-2.5">
                {pendingTasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[#0B0F19]/60 border border-[#1F2C4C]/60 hover:border-sky-500/30 transition group"
                  >
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => onCompleteTask(task.id)}
                        className="text-slate-500 hover:text-emerald-400 transition"
                        title="Mark complete"
                      >
                        <CheckCircleIcon className="w-4 h-4" />
                      </button>
                      <div>
                        <div className="text-xs font-semibold text-slate-200 group-hover:text-white transition">
                          {task.title}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
                          <span>{task.duration} min</span>
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
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
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
        </div>

        {/* Right Column: Fixed Calendar Events & Deadlines */}
        <div className="space-y-6">
          {/* Fixed Calendar Events */}
          <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <CalendarIcon className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Fixed Events
                </h2>
              </div>
              <span className="text-[11px] text-slate-500">Immovable</span>
            </div>

            {fixedEvents.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                No fixed events scheduled for this date.
              </div>
            ) : (
              <div className="space-y-2.5">
                {fixedEvents.map((event) => {
                  const s = new Date(event.startTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const e = new Date(event.endTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <div
                      key={event.id}
                      className="p-3 rounded-lg bg-[#0B0F19]/60 border border-indigo-900/30"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200">
                          {event.title}
                        </span>
                        <LockIcon className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                      <div className="text-[11px] text-indigo-300/80 font-mono mt-1">
                        {s} – {e}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming Deadlines Widget */}
          <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl p-5 shadow-sm">
            <div className="flex items-center space-x-2 mb-3">
              <AlertTriangleIcon className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Upcoming Deadlines
              </h2>
            </div>
            {tasks.filter((t) => t.deadline).length === 0 ? (
              <div className="text-slate-500 text-xs py-4 text-center">
                No pending deadlines set for tracked tasks.
              </div>
            ) : (
              <div className="space-y-2">
                {tasks
                  .filter((t) => t.deadline)
                  .slice(0, 3)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded bg-[#0B0F19]/40 border border-[#1F2C4C] text-xs flex justify-between items-center"
                    >
                      <span className="text-slate-200 font-medium truncate max-w-[140px]">
                        {t.title}
                      </span>
                      <span className="text-amber-400/90 text-[11px] font-mono">
                        {new Date(t.deadline!).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
