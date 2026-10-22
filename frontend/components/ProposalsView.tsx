"use client";

import React from "react";
import { PreviewReplanResult, Plan } from "../lib/types";
import { ShieldCheckIcon, ClockIcon, UndoIcon, HistoryIcon, CheckCircleIcon } from "./Icons";

interface ProposalsViewProps {
  currentProposal: PreviewReplanResult | null;
  onOpenModal: () => void;
  history: Array<{
    id: string;
    version: number;
    status: string;
    replanReason: string | null;
    itemCount: number;
    createdAt: string;
    items: any[];
  }>;
  onRollback: (version?: number) => void;
  isRollingBack: boolean;
}

export function ProposalsView({
  currentProposal,
  onOpenModal,
  history,
  onRollback,
  isRollingBack,
}: ProposalsViewProps) {
  return (
    <div className="space-y-6">
      {/* Active Proposal Card (if one is pending review) */}
      {currentProposal ? (
        <div className="bg-gradient-to-br from-[#131D33] to-[#0E1726] border border-amber-500/40 rounded-xl p-6 shadow-lg shadow-amber-500/5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <span className="h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Pending Replan Proposal (Version {currentProposal.proposedVersion})
              </h3>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Awaiting Approval
            </span>
          </div>

          <p className="text-xs text-slate-300">
            Reason: <span className="text-white font-medium">{currentProposal.replanReason}</span>
          </p>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="p-2.5 rounded-lg bg-[#0B0F19] border border-[#1F2C4C]">
              <span className="text-slate-400">Moved Tasks</span>
              <div className="text-base font-bold text-amber-400">
                {currentProposal.diff.summary.totalMoved}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0B0F19] border border-[#1F2C4C]">
              <span className="text-slate-400">Preserved Tasks</span>
              <div className="text-base font-bold text-emerald-400">
                {currentProposal.tradeOffs.filter((t) => t.includes("Preserved")).length || 1}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0B0F19] border border-[#1F2C4C]">
              <span className="text-slate-400">Unscheduled</span>
              <div className="text-base font-bold text-slate-300">
                {currentProposal.unscheduledTasks.length}
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={onOpenModal}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-sm"
            >
              Review Diff & Commit Decision →
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl p-6 text-center text-slate-400 text-xs">
          No candidate replan proposal is currently pending approval.
        </div>
      )}

      {/* Plan Version Audit History */}
      <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center space-x-2 border-b border-[#1F2C4C] pb-3">
          <HistoryIcon className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Plan Version History & Audit Trail
          </h3>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs">
            No plan versions recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((ver) => {
              const isCurrentActive = ver.status === "ACTIVE";
              return (
                <div
                  key={ver.id}
                  className={`p-4 rounded-xl border transition flex items-center justify-between text-xs ${
                    isCurrentActive
                      ? "bg-emerald-950/20 border-emerald-500/30"
                      : "bg-[#0B0F19]/60 border-[#1F2C4C]"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white">Version {ver.version}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                          ver.status === "ACTIVE"
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                            : ver.status === "PROPOSED"
                            ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                            : ver.status === "SUPERSEDED"
                            ? "bg-slate-700/50 text-slate-400 border-slate-600"
                            : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                        }`}
                      >
                        {ver.status}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Reason: {ver.replanReason || "Initial Baseline"} • {ver.itemCount} scheduled blocks
                    </p>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Recorded: {new Date(ver.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {ver.status === "SUPERSEDED" && (
                    <button
                      onClick={() => onRollback(ver.version)}
                      disabled={isRollingBack}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition active:scale-95 disabled:opacity-50"
                    >
                      <UndoIcon className="w-3.5 h-3.5" />
                      <span>Restore This Version</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
