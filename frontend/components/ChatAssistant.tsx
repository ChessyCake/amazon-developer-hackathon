"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChatMessage, PreviewReplanResult } from "../lib/types";
import {
  SparklesIcon,
  SendIcon,
  ShieldCheckIcon,
  ClockIcon,
  AlertTriangleIcon,
} from "./Icons";

interface ChatAssistantProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  isLoading: boolean;
  onOpenProposal: (proposal: PreviewReplanResult) => void;
  error: string | null;
}

export function ChatAssistant({
  messages,
  onSendMessage,
  isLoading,
  onOpenProposal,
  error,
}: ChatAssistantProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput("");
    await onSendMessage(msg);
  };

  const suggestions = [
    "My lab ran an hour late. Replan my day, but preserve my exam preparation.",
    "What do I need to finish today and plan my day?",
    "Add an assignment due tomorrow with 60 minute duration.",
  ];

  return (
    <div className="bg-[#131D33] border border-[#1F2C4C] rounded-2xl flex flex-col h-[650px] shadow-sm overflow-hidden">
      {/* Chat Header */}
      <div className="px-5 py-3.5 border-b border-[#1F2C4C] bg-[#0E1726] flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="h-7 w-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
            <SparklesIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              LifeOS AI Planning Agent
            </h3>
            <p className="text-[11px] text-slate-400">
              Tool-mediated planning • MCP compliant
            </p>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
          Ready
        </span>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 px-4 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto border border-sky-500/20">
              <SparklesIcon className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">How can LifeOS assist your schedule?</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                Report schedule disruptions, add assignments, or ask for your daily plan. Actions are executed via real MCP tools.
              </p>
            </div>
            {/* Suggestion Chips */}
            <div className="pt-2 flex flex-col items-center space-y-2">
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(s)}
                  disabled={isLoading}
                  className="text-xs px-3.5 py-2 rounded-xl bg-[#0B0F19] hover:bg-[#18243E] text-slate-300 border border-[#1F2C4C] hover:border-sky-500/40 transition text-left max-w-md w-full shadow-sm"
                >
                  <span className="text-sky-400 font-semibold mr-1.5">“</span>
                  {s}
                  <span className="text-sky-400 font-semibold ml-1.5">”</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm ${
                msg.role === "user"
                  ? "bg-sky-600 text-white rounded-br-none"
                  : "bg-[#0B0F19] border border-[#1F2C4C] text-slate-200 rounded-bl-none space-y-2.5"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {/* Tool Execution Disclosure Pills */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="pt-2 border-t border-[#1F2C4C]/60 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    MCP Tools Invoked:
                  </span>
                  {msg.toolCalls.map((tc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center space-x-1.5 p-1.5 rounded bg-[#131D33] border border-[#1F2C4C] text-[11px] font-mono text-sky-300"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                      <span>{tc.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Replan Proposal Interactive Card */}
              {msg.proposal && (
                <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-300 flex items-center space-x-1">
                      <ShieldCheckIcon className="w-3.5 h-3.5" />
                      <span>Proposed Replan (Version {msg.proposal.proposedVersion})</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                      Pending Approval
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    {msg.proposal.tradeOffs[0] || "Structured replan candidate ready for your review."}
                  </p>
                  <button
                    onClick={() => onOpenProposal(msg.proposal!)}
                    className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-sm"
                  >
                    Review Diff & Approve
                  </button>
                </div>
              )}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 px-1">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-2 text-slate-400 text-xs p-3 rounded-2xl bg-[#0B0F19] border border-[#1F2C4C] max-w-[200px]">
            <div className="h-2 w-2 rounded-full bg-sky-400 animate-ping" />
            <span>Agent reasoning & tool calls...</span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
            <AlertTriangleIcon className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-3.5 bg-[#0E1726] border-t border-[#1F2C4C] flex items-center space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask LifeOS or report a disruption (e.g. 'My lab ran 1h late')..."
          disabled={isLoading}
          className="flex-1 bg-[#0B0F19] border border-[#1F2C4C] rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="p-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-sky-600/20"
        >
          <SendIcon className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
