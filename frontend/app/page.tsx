"use client";

import React, { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import {
  DayContext,
  Task,
  Plan,
  PreviewReplanResult,
  ActionHistory,
  UserPreference,
  ChatMessage,
  TaskPriority,
} from "../lib/types";

import { Header } from "../components/Header";
import { Dashboard } from "../components/Dashboard";
import { Timeline } from "../components/Timeline";
import { ChatAssistant } from "../components/ChatAssistant";
import { TaskManager } from "../components/TaskManager";
import { PlanComparisonModal } from "../components/PlanComparisonModal";
import { ProposalsView } from "../components/ProposalsView";
import { ActivityFeed } from "../components/ActivityFeed";
import { PreferencesView } from "../components/PreferencesView";
import { MessageSquareIcon, SparklesIcon } from "../components/Icons";

export default function Home() {
  const [currentDate, setCurrentDate] = useState("2026-10-22");
  const [activeTab, setActiveTab] = useState("dashboard");

  // State
  const [context, setContext] = useState<DayContext | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<ActionHistory[]>([]);
  const [preferences, setPreferences] = useState<UserPreference | null>(null);
  const [planHistory, setPlanHistory] = useState<any[]>([]);

  // Replan Proposal State (Stage 4)
  const [currentProposal, setCurrentProposal] = useState<PreviewReplanResult | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);

  // Loading flags
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMutatingTask, setIsMutatingTask] = useState(false);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  // 1. Fetch All Data
  const refreshData = useCallback(async (date: string = currentDate) => {
    try {
      setIsLoadingData(true);
      const [ctxRes, taskRes, planRes, histRes, actRes, prefRes] = await Promise.all([
        api.getContext(date).catch(() => ({ context: null })),
        api.getTasks().catch(() => ({ tasks: [] })),
        api.getPlan(date).catch(() => ({ plan: null })),
        api.getPlanHistory(date).catch(() => ({ history: [] })),
        api.getActivity(undefined, 25).catch(() => ({ activities: [] })),
        api.getPreferences().catch(() => ({ preferences: null })),
      ]);

      if (ctxRes.context) setContext(ctxRes.context);
      if (taskRes.tasks) setTasks(taskRes.tasks);
      setActivePlan(planRes.plan);
      if (histRes.history) setPlanHistory(histRes.history);
      if (actRes.activities) setActivities(actRes.activities);
      if (prefRes.preferences) setPreferences(prefRes.preferences);
    } catch (err: any) {
      console.error("Failed to load LifeOS data:", err);
    } finally {
      setIsLoadingData(false);
    }
  }, [currentDate]);

  useEffect(() => {
    refreshData(currentDate);
  }, [currentDate, refreshData]);

  // 2. Demo Baseline Reset
  const handleResetDemo = async () => {
    try {
      setIsResetting(true);
      await api.seedDemo(undefined, currentDate);
      setCurrentProposal(null);
      await refreshData(currentDate);
      setMessages([
        {
          id: `sys-${Date.now()}`,
          role: "assistant",
          content:
            "Baseline schedule initialized! Chemistry Lab (10:00 - 12:00) is scheduled, followed by Operating Systems Assignment, Exam preparation, and DSA practice (Plan Version 1 Committed). Ready to simulate schedule disruptions.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      alert(`Demo reset failed: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  // 3. Conversational Assistant Execution
  const handleSendMessage = async (text: string) => {
    try {
      setIsChatLoading(true);
      setChatError(null);

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const res = await api.sendChatMessage({
        message: text,
        conversationId,
        date: currentDate,
      });

      if (res.conversationId) setConversationId(res.conversationId);

      // Check if preview_replan was invoked by the agent
      const replanToolCall = res.actionsExecuted?.find(
        (a) => a.tool === "preview_replan" && a.success
      );

      let proposalResult: PreviewReplanResult | undefined;
      if (replanToolCall && replanToolCall.result) {
        proposalResult = replanToolCall.result as PreviewReplanResult;
        setCurrentProposal(proposalResult);
        // Automatically open the comparison modal so user can immediately review diff!
        setIsModalOpen(true);
      }

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: res.content,
        toolCalls: res.actionsExecuted?.map((a) => ({ name: a.tool, arguments: a.arguments })),
        toolResults: res.actionsExecuted?.map((a) => a.result),
        timestamp: new Date().toISOString(),
        proposal: proposalResult,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      await refreshData(currentDate);
    } catch (err: any) {
      setChatError(err.message || "Agent execution failed.");
    } finally {
      setIsChatLoading(false);
    }
  };

  // 4. Quick Replan from Dashboard
  const handleQuickReplan = async (text: string) => {
    setIsChatDrawerOpen(true);
    await handleSendMessage(text);
  };

  // 5. Commit Plan Proposal (Stage 4)
  const handleCommitPlan = async (planId: string, version: number) => {
    try {
      setIsCommitting(true);
      setModalError(null);
      await api.commitPlan(planId, version);
      setIsModalOpen(false);
      setCurrentProposal(null);
      await refreshData(currentDate);
      setActiveTab("timeline"); // Navigate to timeline to see committed schedule
    } catch (err: any) {
      setModalError(err.message || "Failed to commit proposal. Please review updated preview.");
    } finally {
      setIsCommitting(false);
    }
  };

  // 6. Reject Plan Proposal
  const handleRejectPlan = async (planId: string, reason: string) => {
    try {
      setIsRejecting(true);
      await api.rejectPlan(planId, reason);
      setIsModalOpen(false);
      setCurrentProposal(null);
      await refreshData(currentDate);
    } catch (err: any) {
      setModalError(err.message || "Failed to reject plan.");
    } finally {
      setIsRejecting(false);
    }
  };

  // 7. Rollback Plan
  const handleRollback = async (targetVersion?: number) => {
    try {
      setIsRollingBack(true);
      await api.rollbackPlan(currentDate, targetVersion);
      await refreshData(currentDate);
    } catch (err: any) {
      alert(`Rollback failed: ${err.message}`);
    } finally {
      setIsRollingBack(false);
    }
  };

  // 8. Generate Base Plan
  const handleGeneratePlan = async () => {
    try {
      setIsGenerating(true);
      const res = await api.generatePlan(currentDate, true);
      await api.approvePlan(res.planId);
      await refreshData(currentDate);
    } catch (err: any) {
      alert(`Generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // 9. Task Management Handlers
  const handleCreateTask = async (taskData: any) => {
    try {
      setIsMutatingTask(true);
      await api.createTask(taskData);
      await refreshData(currentDate);
    } finally {
      setIsMutatingTask(false);
    }
  };

  const handleUpdateTask = async (id: string, updates: Partial<Task>) => {
    try {
      setIsMutatingTask(true);
      await api.updateTask(id, updates);
      await refreshData(currentDate);
    } finally {
      setIsMutatingTask(false);
    }
  };

  const handleCompleteTask = async (id: string) => {
    try {
      setIsMutatingTask(true);
      await api.completeTask(id);
      await refreshData(currentDate);
    } finally {
      setIsMutatingTask(false);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      setIsMutatingTask(true);
      await api.deleteTask(id);
      await refreshData(currentDate);
    } finally {
      setIsMutatingTask(false);
    }
  };

  // 10. Preferences Handlers
  const handleSavePreferences = async (data: Partial<UserPreference>) => {
    try {
      setIsSavingPrefs(true);
      await api.updatePreferences(undefined, data);
      await refreshData(currentDate);
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const hasSuperseded = planHistory.some((p) => p.status === "SUPERSEDED");

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col">
      {/* Top Header */}
      <Header
        currentDate={currentDate}
        onDateChange={setCurrentDate}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onResetDemo={handleResetDemo}
        isResetting={isResetting}
        proposedPlanCount={currentProposal ? 1 : 0}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoadingData && !context && !activePlan ? (
          <div className="flex items-center justify-center py-24 space-x-2 text-slate-400 text-sm">
            <div className="h-4 w-4 rounded-full bg-sky-400 animate-ping" />
            <span>Connecting to LifeOS Engine...</span>
          </div>
        ) : (
          <>
            {activeTab === "dashboard" && (
              <Dashboard
                context={context}
                activePlan={activePlan}
                tasks={tasks}
                onQuickReplan={handleQuickReplan}
                onOpenTimeline={() => setActiveTab("timeline")}
                onCompleteTask={handleCompleteTask}
              />
            )}

            {activeTab === "timeline" && (
              <Timeline
                plan={activePlan}
                onGeneratePlan={handleGeneratePlan}
                onRollback={() => handleRollback()}
                isGenerating={isGenerating}
                isRollingBack={isRollingBack}
                canRollback={hasSuperseded}
              />
            )}

            {activeTab === "proposals" && (
              <ProposalsView
                currentProposal={currentProposal}
                onOpenModal={() => setIsModalOpen(true)}
                history={planHistory}
                onRollback={(v) => handleRollback(v)}
                isRollingBack={isRollingBack}
              />
            )}

            {activeTab === "tasks" && (
              <TaskManager
                tasks={tasks}
                onCreateTask={handleCreateTask}
                onUpdateTask={handleUpdateTask}
                onCompleteTask={handleCompleteTask}
                onDeleteTask={handleDeleteTask}
                isMutating={isMutatingTask}
              />
            )}

            {activeTab === "activity" && (
              <ActivityFeed
                activities={activities}
                onRefresh={() => refreshData(currentDate)}
                isLoading={isLoadingData}
              />
            )}

            {activeTab === "preferences" && (
              <PreferencesView
                preferences={preferences}
                onSave={handleSavePreferences}
                isSaving={isSavingPrefs}
              />
            )}
          </>
        )}
      </main>

      {/* Persistent Floating Chat Trigger (Bottom-Right) */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setIsChatDrawerOpen(!isChatDrawerOpen)}
          className="flex items-center space-x-2 px-4 py-3 rounded-full bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs shadow-xl shadow-sky-600/30 transition active:scale-95 border border-sky-400/30"
        >
          <SparklesIcon className="w-4 h-4" />
          <span>{isChatDrawerOpen ? "Close Assistant" : "Ask Assistant"}</span>
        </button>
      </div>

      {/* Floating Chat Drawer */}
      {isChatDrawerOpen && (
        <div className="fixed bottom-20 right-6 z-40 w-full sm:w-[460px] animate-in slide-in-from-bottom-5 duration-200">
          <ChatAssistant
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isChatLoading}
            onOpenProposal={(prop) => {
              setCurrentProposal(prop);
              setIsModalOpen(true);
            }}
            error={chatError}
          />
        </div>
      )}

      {/* Replan Proposal Comparison & Approval Modal (Stage 4 Core Deliverable) */}
      {isModalOpen && currentProposal && (
        <PlanComparisonModal
          proposal={currentProposal}
          onCommit={handleCommitPlan}
          onReject={handleRejectPlan}
          onClose={() => setIsModalOpen(false)}
          isCommitting={isCommitting}
          isRejecting={isRejecting}
          error={modalError}
        />
      )}
    </div>
  );
}
