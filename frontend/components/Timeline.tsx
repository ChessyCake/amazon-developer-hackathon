"use client";

import React from "react";
import { Plan, PlanItem } from "../lib/types";
import {
  ClockIcon,
  ShieldCheckIcon,
  LockIcon,
  CoffeeIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  UndoIcon,
  RefreshCwIcon,
} from "./Icons";

interface TimelineProps {
  plan: Plan | null;
  onGeneratePlan: () => void;
  onRollback: () => void;
  isGenerating: boolean;
  isRollingBack: boolean;
  canRollback: boolean;
}

export function Timeline({
  plan,
  onGeneratePlan,
  onRollback,
  isGenerating,
  isRollingBack,
  canRollback,
}: TimelineProps) {
  if (!plan || !plan.items || plan.items.length === 0) {
    return (
      <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl p-8 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto">
          <ClockIcon className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">No Committed Schedule for this Date</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
            Run the deterministic scheduling engine to allocate pending tasks and breaks around fixed calendar events.
          </p>
        </div>
        <button
          onClick={onGeneratePlan}
          disabled={isGenerating}
          className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition active:scale-95 disabled:opacity-50"
        >
          {isGenerating ? "Calculating Schedule..." : "Generate Daily Plan"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Timeline Controls Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#131D33] border border-[#1F2C4C] rounded-xl p-4 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Committed Schedule Timeline
            </h2>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                plan.status === "ACTIVE"
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : "bg-slate-700 text-slate-300 border-slate-600"
              }`}
            >
              {plan.status} • Version {plan.version}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Plan ID: <code className="text-slate-300 font-mono">{plan.id}</code>
            {plan.replanReason && (
              <span className="ml-2 text-sky-400 italic">({plan.replanReason})</span>
            )}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {canRollback && (
            <button
              onClick={onRollback}
              disabled={isRollingBack}
              title="Safely restore previous plan version via compensating transaction"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium transition active:scale-95 disabled:opacity-50"
            >
              <UndoIcon className={`w-3.5 h-3.5 ${isRollingBack ? "animate-spin" : ""}`} />
              <span>{isRollingBack ? "Rolling back..." : "Undo / Rollback"}</span>
            </button>
          )}

          <button
            onClick={onGeneratePlan}
            disabled={isGenerating}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-[#0B0F19] hover:bg-[#1E293B] text-slate-200 border border-[#1F2C4C] text-xs font-medium transition"
          >
            <RefreshCwIcon className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
            <span>Regenerate</span>
          </button>
        </div>
      </div>

      {/* Visual Schedule Block Stack */}
      <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl p-5 shadow-sm space-y-3">
        {plan.items.map((item, idx) => {
          const sTime = new Date(item.startTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const eTime = new Date(item.endTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          const durationMins = Math.round(
            (new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 60000
          );

          if (item.itemType === "EVENT") {
            return (
              <div
                key={item.id || idx}
                className="flex items-start sm:items-center justify-between p-3.5 rounded-lg bg-[#0F172A] border border-indigo-500/30 hover:border-indigo-500/50 transition group"
              >
                <div className="flex items-start sm:items-center space-x-3">
                  <div className="h-8 w-8 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                    <LockIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">{item.title}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                        Fixed Event
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Immovable calendar commitment • {durationMins} minutes
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-mono font-bold text-indigo-300">
                    {sTime} – {eTime}
                  </span>
                </div>
              </div>
            );
          }

          if (item.itemType === "BREAK") {
            return (
              <div
                key={item.id || idx}
                className="flex items-center justify-between py-2 px-3.5 rounded-lg bg-[#0B0F19]/40 border border-slate-800/80"
              >
                <div className="flex items-center space-x-3">
                  <CoffeeIcon className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-xs font-medium text-slate-400 italic">
                    {item.title} ({durationMins}m rest)
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  {sTime} – {eTime}
                </span>
              </div>
            );
          }

          // Scheduled Task Item
          return (
            <div
              key={item.id || idx}
              className={`flex items-start sm:items-center justify-between p-3.5 rounded-lg border transition group ${
                item.isCompleted
                  ? "bg-[#0B0F19]/40 border-slate-800 opacity-60"
                  : "bg-[#0E1726] border-sky-500/25 hover:border-sky-500/50"
              }`}
            >
              <div className="flex items-start sm:items-center space-x-3">
                <div
                  className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                    item.isCompleted
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-sky-500/15 text-sky-400"
                  }`}
                >
                  <CheckCircleIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-xs font-bold ${
                        item.isCompleted ? "line-through text-slate-400" : "text-white"
                      }`}
                    >
                      {item.title}
                    </span>
                    {item.part && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-medium">
                        Part {item.part}/{item.totalParts}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Focused execution block • {durationMins} minutes
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-mono font-bold text-sky-300">
                  {sTime} – {eTime}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
