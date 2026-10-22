"use client";

import React, { useState } from "react";
import { Task, TaskPriority, TaskStatus } from "../lib/types";
import {
  PlusIcon,
  CheckCircleIcon,
  CircleIcon,
  TrashIcon,
  EditIcon,
  CalendarIcon,
  ClockIcon,
  XIcon,
} from "./Icons";

interface TaskManagerProps {
  tasks: Task[];
  onCreateTask: (task: {
    title: string;
    description?: string;
    duration: number;
    priority: TaskPriority;
    deadline?: string;
    tags: string[];
    allowSplitting: boolean;
  }) => Promise<void>;
  onUpdateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  onCompleteTask: (id: string) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  isMutating: boolean;
}

export function TaskManager({
  tasks,
  onCreateTask,
  onUpdateTask,
  onCompleteTask,
  onDeleteTask,
  isMutating,
}: TaskManagerProps) {
  const [filterStatus, setFilterStatus] = useState<"ALL" | TaskStatus>("ALL");
  const [filterPriority, setFilterPriority] = useState<"ALL" | TaskPriority>("ALL");
  const [search, setSearch] = useState("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(45);
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [deadline, setDeadline] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [allowSplitting, setAllowSplitting] = useState(false);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDuration(45);
    setPriority("MEDIUM");
    setDeadline("");
    setTagsInput("");
    setAllowSplitting(false);
    setEditingTask(null);
    setIsCreateOpen(false);
  };

  const handleOpenEdit = (task: Task) => {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description || "");
    setDuration(task.duration);
    setPriority(task.priority);
    setDeadline(task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : "");
    setTagsInput(task.tags ? task.tags.join(", ") : "");
    setAllowSplitting(task.allowSplitting);
    setIsCreateOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingTask) {
      await onUpdateTask(editingTask.id, {
        title,
        description: description || null,
        duration: Number(duration),
        priority,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        tags,
        allowSplitting,
      });
    } else {
      await onCreateTask({
        title,
        description: description || undefined,
        duration: Number(duration),
        priority,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        tags,
        allowSplitting,
      });
    }
    resetForm();
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
    if (filterPriority !== "ALL" && t.priority !== filterPriority) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#131D33] border border-[#1F2C4C] rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          {(["ALL", "PENDING", "COMPLETED"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filterStatus === st
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                  : "text-slate-400 hover:text-white hover:bg-[#0B0F19]"
              }`}
            >
              {st}
            </button>
          ))}

          {/* Priority Select */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-[#0B0F19] border border-[#1F2C4C] text-xs text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-[#0B0F19] border border-[#1F2C4C] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
          <button
            onClick={() => {
              resetForm();
              setIsCreateOpen(true);
            }}
            className="flex items-center space-x-1 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition active:scale-95 shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl overflow-hidden shadow-sm">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            No tasks match the selected filters.
          </div>
        ) : (
          <div className="divide-y divide-[#1F2C4C]/60">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className="p-4 flex items-center justify-between hover:bg-[#18243E]/50 transition group"
              >
                <div className="flex items-center space-x-3.5">
                  <button
                    onClick={() => onCompleteTask(task.id)}
                    disabled={isMutating}
                    className="text-slate-500 hover:text-emerald-400 transition"
                    title={task.status === "COMPLETED" ? "Completed" : "Mark as completed"}
                  >
                    {task.status === "COMPLETED" ? (
                      <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <CircleIcon className="w-5 h-5" />
                    )}
                  </button>

                  <div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-xs font-bold ${
                          task.status === "COMPLETED"
                            ? "line-through text-slate-500"
                            : "text-slate-100"
                        }`}
                      >
                        {task.title}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
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

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mt-1">
                      <span className="flex items-center space-x-1">
                        <ClockIcon className="w-3 h-3 text-slate-500" />
                        <span>{task.duration} min</span>
                      </span>

                      {task.deadline && (
                        <span className="flex items-center space-x-1 text-amber-400/90 font-mono">
                          <CalendarIcon className="w-3 h-3" />
                          <span>
                            {new Date(task.deadline).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </span>
                      )}

                      {task.tags && task.tags.length > 0 && (
                        <span className="text-slate-500">
                          Tags: {task.tags.join(", ")}
                        </span>
                      )}

                      {task.allowSplitting && (
                        <span className="text-[10px] text-sky-400/90 font-medium">
                          (Splittable)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 opacity-80 group-hover:opacity-100 transition">
                  <button
                    onClick={() => handleOpenEdit(task)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#0B0F19] transition"
                    title="Edit task"
                  >
                    <EditIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteTask(task.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-[#0B0F19] transition"
                    title="Delete task"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Task Creation / Edit Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#0E1726] border border-[#1F2C4C] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1F2C4C] pb-3">
              <h3 className="text-sm font-bold text-white">
                {editingTask ? "Edit Task" : "Create New Task"}
              </h3>
              <button onClick={resetForm} className="text-slate-400 hover:text-white">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Operating Systems Assignment"
                  className="w-full bg-[#0B0F19] border border-[#1F2C4C] rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional details or context..."
                  className="w-full bg-[#0B0F19] border border-[#1F2C4C] rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Duration (minutes) *</label>
                  <input
                    type="number"
                    min={5}
                    step={5}
                    required
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full bg-[#0B0F19] border border-[#1F2C4C] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full bg-[#0B0F19] border border-[#1F2C4C] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Deadline</label>
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full bg-[#0B0F19] border border-[#1F2C4C] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. academic, cs, urgent"
                  className="w-full bg-[#0B0F19] border border-[#1F2C4C] rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="allowSplitting"
                  checked={allowSplitting}
                  onChange={(e) => setAllowSplitting(e.target.checked)}
                  className="rounded border-[#1F2C4C] text-sky-600 focus:ring-0 bg-[#0B0F19]"
                />
                <label htmlFor="allowSplitting" className="text-slate-300">
                  Allow scheduler to split this task across focus blocks if needed
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-[#1F2C4C]">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-lg bg-[#131D33] text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isMutating}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-sm"
                >
                  {editingTask ? "Save Changes" : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
