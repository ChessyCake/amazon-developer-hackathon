"use client";

import React, { useState } from "react";
import { PreviewReplanResult } from "../lib/types";
import {
  ShieldCheckIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  XIcon,
} from "./Icons";

interface PlanComparisonModalProps {
  proposal: PreviewReplanResult | null;
  onCommit: (planId: string, version: number) => Promise<void>;
  onReject: (planId: string, reason: string) => Promise<void>;
  onClose: () => void;
  isCommitting: boolean;
  isRejecting: boolean;
  error: string | null;
}

export function PlanComparisonModal({
  proposal,
  onCommit,
  onReject,
  onClose,
  isCommitting,
  isRejecting,
  error,
}: PlanComparisonModalProps) {
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  if (!proposal) return null;

  const { diff, tradeOffs, unscheduledTasks, replanReason, proposedVersion, proposedPlanId, baseVersion } = proposal;

  const handleCommit = async () => {
    await onCommit(proposedPlanId, proposedVersion);
  };

  const handleReject = async () => {
    await onReject(proposedPlanId, rejectReason || "Rejected by user");
    setShowRejectInput(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#0E1726] border border-[#1F2C4C] rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/80 flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-[#1F2C4C] flex items-center justify-between sticky top-0 bg-[#0E1726]/95 backdrop-blur z-10">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
              <ShieldCheckIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white">Replan Proposal Review</h3>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Version {proposedVersion} (Candidate)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Base: Version {baseVersion || 1} • Reason: <span className="text-slate-200 font-medium">{replanReason}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#131D33] transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 flex-1">
          {/* Execution Safety Notice */}
          <div className="p-3.5 rounded-xl bg-sky-950/40 border border-sky-500/20 flex items-start space-x-3 text-xs text-sky-200">
            <ShieldCheckIcon className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-sky-100">Safe Execution Guarantee:</span> This preview is non-destructive. Your current committed schedule remains untouched until you explicitly confirm approval below.
            </div>
          </div>

          {/* Error Banner (Stale version, concurrent modifications, etc.) */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 flex items-start space-x-3 text-xs text-rose-200">
              <AlertTriangleIcon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-rose-100">Approval Conflict Detected</h4>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Structured Diff Summary Stats */}
          <div className="grid grid-cols-4 gap-2.5 text-center">
            <div className="p-3 rounded-lg bg-[#131D33] border border-[#1F2C4C]">
              <span className="text-xs text-slate-400">Moved</span>
              <div className="text-lg font-bold text-amber-400">{diff.summary.totalMoved}</div>
            </div>
            <div className="p-3 rounded-lg bg-[#131D33] border border-[#1F2C4C]">
              <span className="text-xs text-slate-400">Added</span>
              <div className="text-lg font-bold text-emerald-400">{diff.summary.totalAdded}</div>
            </div>
            <div className="p-3 rounded-lg bg-[#131D33] border border-[#1F2C4C]">
              <span className="text-xs text-slate-400">Removed</span>
              <div className="text-lg font-bold text-rose-400">{diff.summary.totalRemoved}</div>
            </div>
            <div className="p-3 rounded-lg bg-[#131D33] border border-[#1F2C4C]">
              <span className="text-xs text-slate-400">Unchanged</span>
              <div className="text-lg font-bold text-slate-300">{diff.summary.totalUnchanged}</div>
            </div>
          </div>

          {/* Trade-off Explanations */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
              <span>Trade-off Explanations & Preservation Audit</span>
            </h4>
            <div className="p-4 rounded-xl bg-[#0B0F19] border border-[#1F2C4C] space-y-2 text-xs">
              {tradeOffs.map((to, i) => (
                <div key={i} className="flex items-start space-x-2 text-slate-300">
                  <span className="text-sky-400 font-bold shrink-0">•</span>
                  <span>{to}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Shifted / Moved Blocks */}
          {diff.moved.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
                <span>Shifted Schedule Blocks ({diff.moved.length})</span>
              </h4>
              <div className="space-y-2">
                {diff.moved.map((item, i) => {
                  const oldS = item.oldStartTime ? new Date(item.oldStartTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "?";
                  const newS = item.newStartTime ? new Date(item.newStartTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "?";
                  return (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-[#131D33] border border-amber-500/20 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-white">{item.title}</span>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Reason: <span className="text-amber-300">{item.reason || "Shifted"}</span>
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-slate-500 line-through mr-2">{oldS}</span>
                        <span className="text-amber-400 font-bold">→ {newS}</span>
                        {item.shiftMinutes !== undefined && item.shiftMinutes !== 0 && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300">
                            {item.shiftMinutes > 0 ? `+${item.shiftMinutes}m` : `${item.shiftMinutes}m`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unscheduled Tasks (Tasks that could not fit) */}
          {unscheduledTasks && unscheduledTasks.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center space-x-1.5">
                <span>Tasks that Cannot Fit ({unscheduledTasks.length})</span>
              </h4>
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 space-y-2 text-xs">
                {unscheduledTasks.map((u, i) => (
                  <div key={i} className="flex justify-between items-center text-rose-200">
                    <span className="font-semibold">{u.title} ({u.duration}m)</span>
                    <span className="text-[11px] italic">{u.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-[#1F2C4C] bg-[#0E1726]/95 flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-0">
          <div className="text-xs text-slate-400">
            Target Plan: <code className="text-slate-300 font-mono">{proposedPlanId}</code>
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            {!showRejectInput ? (
              <button
                onClick={() => setShowRejectInput(true)}
                disabled={isCommitting || isRejecting}
                className="px-4 py-2 rounded-xl bg-[#131D33] hover:bg-rose-950/40 text-rose-300 border border-rose-500/30 text-xs font-semibold transition disabled:opacity-50"
              >
                Reject Proposal
              </button>
            ) : (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Reason for rejection..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-[#0B0F19] border border-[#1F2C4C] text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                />
                <button
                  onClick={handleReject}
                  disabled={isRejecting}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition"
                >
                  {isRejecting ? "Rejecting..." : "Confirm Reject"}
                </button>
              </div>
            )}

            <button
              onClick={handleCommit}
              disabled={isCommitting || isRejecting}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              <CheckCircleIcon className={`w-4 h-4 ${isCommitting ? "animate-spin" : ""}`} />
              <span>{isCommitting ? "Committing Schedule..." : `Approve & Commit Plan (v${proposedVersion})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
