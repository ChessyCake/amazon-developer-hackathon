"use client";

import React from "react";
import { ActionHistory } from "../lib/types";
import { HistoryIcon, ShieldCheckIcon, ClockIcon, SparklesIcon, UndoIcon } from "./Icons";

interface ActivityFeedProps {
  activities: ActionHistory[];
  onRefresh: () => void;
  isLoading: boolean;
}

export function ActivityFeed({ activities, onRefresh, isLoading }: ActivityFeedProps) {
  const getActionBadge = (type: string) => {
    switch (type) {
      case "COMMIT_PLAN":
      case "APPROVE_PLAN":
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      case "PREVIEW_REPLAN":
      case "WHAT_IF_PREVIEW":
        return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      case "ROLLBACK_PLAN":
        return "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
      case "AGENT_TOOL_CALL":
        return "bg-sky-500/15 text-sky-400 border-sky-500/30";
      default:
        return "bg-slate-700 text-slate-300 border-slate-600";
    }
  };

  return (
    <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-[#1F2C4C]">
        <div className="flex items-center space-x-2">
          <HistoryIcon className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Real Activity & Audit Feed
          </h2>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="text-xs text-sky-400 hover:text-sky-300 transition"
        >
          {isLoading ? "Refreshing..." : "Refresh Feed"}
        </button>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-xs">
          No activity records found yet. Trigger an action or chat with the agent!
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((act) => {
            const timeStr = new Date(act.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            const dateStr = new Date(act.createdAt).toLocaleDateString([], {
              month: "short",
              day: "numeric",
            });

            return (
              <div
                key={act.id}
                className="p-3.5 rounded-lg bg-[#0B0F19]/60 border border-[#1F2C4C] text-xs hover:border-sky-500/30 transition space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getActionBadge(
                        act.actionType
                      )}`}
                    >
                      {act.actionType}
                    </span>
                    <span className="text-slate-300 font-mono text-[11px]">
                      {act.entityType}: {act.entityId || "N/A"}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {dateStr} {timeStr}
                  </span>
                </div>

                {/* Structured Payload summary */}
                {act.payload && (
                  <pre className="p-2.5 rounded bg-[#090D16] border border-[#1F2C4C]/60 text-[11px] text-slate-400 font-mono overflow-x-auto">
                    {JSON.stringify(act.payload, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
