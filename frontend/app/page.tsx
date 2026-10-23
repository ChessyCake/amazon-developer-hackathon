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

import { Sidebar } from "../components/Sidebar";
import { TopBar } from "../components/TopBar";
import { Dashboard } from "../components/Dashboard";
import { Timeline } from "../components/Timeline";
import { ChatAssistant } from "../components/ChatAssistant";
import { TaskManager } from "../components/TaskManager";
import { PlanComparisonModal } from "../components/PlanComparisonModal";
import { ProposalsView } from "../components/ProposalsView";
import { ActivityFeed } from "../components/ActivityFeed";
import { PreferencesView } from "../components/PreferencesView";
import { SparklesIcon, XIcon } from "../components/Icons";

export default function Home() {
  const [currentDate, setCurrentDate] = useState("2026-10-22");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

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

      setConversationId(res.conversationId);

      // Check if a replan proposal was generated
      const replanAction = res.actionsExecuted.find((a) => a.tool === "preview_replan");
      let proposalData: PreviewReplanResult | undefined;

      if (replanAction && replanAction.result) {
        proposalData = {
          proposedPlanId: replanAction.result.proposedPlanId || replanAction.result.planId || "",
          proposedVersion: replanAction.result.proposedVersion || 2,
          basePlanId: replanAction.result.basePlanId || null,
          baseVersion: replanAction.result.baseVersion || null,
          diff: replanAction.result.diff,
          tradeOffs: replanAction.result.tradeOffs || [],
          unscheduledTasks: replanAction.result.unscheduledTasks || [],
          replanReason: replanAction.result.replanReason || "",
          isFeasible: replanAction.result.isFeasible ?? true,
          isWhatIf: replanAction.result.isWhatIf || false,
        };
        setCurrentProposal(proposalData);
      }

      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        role: "assistant",
        content: res.content,
        timestamp: new Date().toISOString(),
        toolCalls: res.actionsExecuted.map((a) => ({
          name: a.tool,
          arguments: a.arguments,
        })),
        proposal: proposalData,
      };

      setMessages((prev) => [...prev, botMsg]);
      await refreshData(currentDate);
    } catch (err: any) {
      setChatError(err.message || "Failed to communicate with LifeOS Assistant");
    } finally {
      setIsChatLoading(false);
    }
  };

  // Quick Replan shortcut
  const handleQuickReplan = async (promptText: string) => {
    setIsAssistantOpen(true);
    await handleSendMessage(promptText);
  };

  // 4. Commit Proposal
  const handleCommitPlan = async () => {
    if (!currentProposal) return;
    try {
      setIsCommitting(true);
      setModalError(null);

      await api.commitPlan(currentProposal.proposedPlanId, currentProposal.proposedVersion);
      setIsModalOpen(false);
      setCurrentProposal(null);
      await refreshData(currentDate);

      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: "assistant",
          content: `Revised plan committed successfully! Version ${currentProposal.proposedVersion} is now ACTIVE in PostgreSQL with version lock protection.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      setModalError(err.message || "Commit failed");
    } finally {
      setIsCommitting(false);
    }
  };

  // 5. Reject Proposal
  const handleRejectPlan = async (reason?: string) => {
    if (!currentProposal) return;
    try {
      setIsRejecting(true);
      setModalError(null);

      await api.rejectPlan(currentProposal.proposedPlanId, reason);
      setIsModalOpen(false);
      setCurrentProposal(null);
      await refreshData(currentDate);

      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: "assistant",
          content: `Proposed plan rejected. The previously committed ACTIVE plan remains untouched.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      setModalError(err.message || "Rejection failed");
    } finally {
      setIsRejecting(false);
    }
  };

  // 6. Rollback to Previous Version
  const handleRollback = async (version?: number) => {
    try {
      setIsRollingBack(true);
      await api.rollbackPlan(currentDate, version, "User manual rollback");
      await refreshData(currentDate);
      alert("Plan rolled back successfully via compensating transaction.");
    } catch (err: any) {
      alert(`Rollback failed: ${err.message}`);
    } finally {
      setIsRollingBack(false);
    }
  };

  // 7. Generate Plan
  const handleGeneratePlan = async (overwrite: boolean = false) => {
    try {
      setIsGenerating(true);
      await api.generatePlan(currentDate, overwrite);
      await refreshData(currentDate);
    } catch (err: any) {
      alert(`Plan generation failed: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // 8. Task CRUD
  const handleCreateTask = async (taskData: {
    title: string;
    description?: string;
    duration: number;
    priority?: TaskPriority;
    deadline?: string;
    tags?: string[];
  }) => {
    try {
      setIsMutatingTask(true);
      await api.createTask(taskData);
      await refreshData(currentDate);
    } catch (err: any) {
      alert(`Failed to create task: ${err.message}`);
    } finally {
      setIsMutatingTask(false);
    }
  };

  const handleUpdateTask = async (id: string, updates: Partial<Task>) => {
    try {
      setIsMutatingTask(true);
      await api.updateTask(id, updates);
      await refreshData(currentDate);
    } catch (err: any) {
      alert(`Failed to update task: ${err.message}`);
    } finally {
      setIsMutatingTask(false);
    }
  };

  const handleCompleteTask = async (id: string) => {
    try {
      setIsMutatingTask(true);
      await api.completeTask(id);
      await refreshData(currentDate);
    } catch (err: any) {
      alert(`Failed to complete task: ${err.message}`);
    } finally {
      setIsMutatingTask(false);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      setIsMutatingTask(true);
      await api.deleteTask(id);
      await refreshData(currentDate);
    } catch (err: any) {
      alert(`Failed to delete task: ${err.message}`);
    } finally {
      setIsMutatingTask(false);
    }
  };

  // 9. Preferences Update
  const handleSavePreferences = async (newPrefs: Partial<UserPreference>) => {
    try {
      setIsSavingPrefs(true);
      await api.updatePreferences(undefined, newPrefs);
      await refreshData(currentDate);
      alert("Preferences saved successfully!");
    } catch (err: any) {
      alert(`Failed to save preferences: ${err.message}`);
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const hasSuperseded = planHistory.some((p) => p.status === "SUPERSEDED");

  const tabTitles: Record<string, { title: string; subtitle: string }> = {
    dashboard: {
      title: "Executive Dashboard",
      subtitle: "Deterministic safe planning, daily briefing & real-time telemetry",
    },
    timeline: {
      title: "Daily Schedule Timeline",
      subtitle: "Visual breakdown of anchor events, focus blocks, and breaks",
    },
    proposals: {
      title: "Plan Proposals & Replan Audit",
      subtitle: "Structured diff review, approval lock, and rollback history",
    },
    tasks: {
      title: "Task Management & Priorities",
      subtitle: "Manage, filter, and track schedulable tasks and deadlines",
    },
    activity: {
      title: "Action History & Audit Log",
      subtitle: "Immutable append-only ledger of all agent and user operations",
    },
    preferences: {
      title: "User Preferences & Boundaries",
      subtitle: "Configure work window, focus/break intervals, and timezone",
    },
  };

  const currentTabInfo = tabTitles[activeTab] || tabTitles.dashboard;

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col antialiased">
      {/* 1. Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        proposedPlanCount={currentProposal ? 1 : 0}
        onResetDemo={handleResetDemo}
        isResetting={isResetting}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* 2. Main Layout Container (Offset by sidebar width on lg screens) */}
      <div className="lg:pl-72 flex flex-col flex-1 min-w-0">
        {/* Top Bar Header */}
        <TopBar
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          activePlan={activePlan}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onToggleAssistant={() => setIsAssistantOpen(!isAssistantOpen)}
          isAssistantOpen={isAssistantOpen}
          onQuickReplan={handleQuickReplan}
          title={currentTabInfo.title}
          subtitle={currentTabInfo.subtitle}
        />

        {/* Content & AI Assistant Split Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Views Container */}
          <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 min-w-0">
            {isLoadingData && !context && !activePlan ? (
              <div className="flex flex-col items-center justify-center py-24 space-y-3 text-slate-400 text-sm">
                <div className="h-5 w-5 rounded-full bg-sky-400 animate-ping" />
                <span className="font-medium">Connecting to LifeOS Engine...</span>
              </div>
            ) : (
              <>
                {activeTab === "dashboard" && (
                  <Dashboard
                    context={context}
                    activePlan={activePlan}
                    tasks={tasks}
                    currentDate={currentDate}
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

          {/* AI Assistant Panel (Docked on xl screens, drawer on mobile/tablet) */}
          {isAssistantOpen && (
            <aside className="w-full sm:w-[440px] xl:w-[460px] border-l border-[#1F2C4C] bg-[#0E1726] flex flex-col shrink-0 fixed inset-y-0 right-0 z-50 xl:static xl:z-0 shadow-2xl xl:shadow-none animate-in slide-in-from-right-4 duration-200">
              {/* Close Button on Top for drawer mode */}
              <div className="xl:hidden flex items-center justify-between p-3 border-b border-[#1F2C4C] bg-[#0B0F19]">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                  <SparklesIcon className="w-4 h-4 text-sky-400" />
                  <span>LifeOS AI Assistant</span>
                </span>
                <button
                  onClick={() => setIsAssistantOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#131D33] transition"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden p-2">
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
            </aside>
          )}
        </div>
      </div>

      {/* Floating Assistant Trigger (Visible when Assistant is closed) */}
      {!isAssistantOpen && (
        <div className="fixed bottom-6 right-6 z-40">
          <button
            onClick={() => setIsAssistantOpen(true)}
            className="flex items-center space-x-2 px-4 py-3 rounded-full bg-gradient-to-r from-sky-600 via-sky-500 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs shadow-xl shadow-sky-600/30 transition-all hover:scale-105 active:scale-95 border border-sky-400/30"
          >
            <SparklesIcon className="w-4 h-4" />
            <span>Ask LifeOS Assistant</span>
          </button>
        </div>
      )}

      {/* Replan Proposal Comparison & Approval Modal */}
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
