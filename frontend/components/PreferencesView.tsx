"use client";

import React, { useState, useEffect } from "react";
import { UserPreference } from "../lib/types";
import { SlidersIcon, CheckCircleIcon } from "./Icons";

interface PreferencesViewProps {
  preferences: UserPreference | null;
  onSave: (data: Partial<UserPreference>) => Promise<void>;
  isSaving: boolean;
}

export function PreferencesView({ preferences, onSave, isSaving }: PreferencesViewProps) {
  const [workStartTime, setWorkStartTime] = useState("09:00");
  const [workEndTime, setWorkEndTime] = useState("18:00");
  const [focusMinutes, setFocusMinutes] = useState(60);
  const [breakMinutes, setBreakMinutes] = useState(10);
  const [bufferMinutes, setBufferMinutes] = useState(5);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (preferences) {
      setWorkStartTime(preferences.workStartTime);
      setWorkEndTime(preferences.workEndTime);
      setFocusMinutes(preferences.focusMinutes);
      setBreakMinutes(preferences.breakMinutes);
      setBufferMinutes(preferences.bufferMinutes);
      if (preferences.timezone) setTimezone(preferences.timezone);
    }
  }, [preferences]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      workStartTime,
      workEndTime,
      focusMinutes: Number(focusMinutes),
      breakMinutes: Number(breakMinutes),
      bufferMinutes: Number(bufferMinutes),
      timezone,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="bg-[#131D33] border border-[#1F2C4C] rounded-xl p-6 shadow-sm max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-[#1F2C4C]">
        <div className="flex items-center space-x-2.5">
          <SlidersIcon className="w-5 h-5 text-sky-400" />
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Scheduling Preferences
            </h2>
            <p className="text-xs text-slate-400">
              Configure deterministic scheduling boundaries and focus session parameters.
            </p>
          </div>
        </div>

        {savedSuccess && (
          <span className="flex items-center space-x-1.5 text-xs text-emerald-400 font-semibold animate-in fade-in">
            <CheckCircleIcon className="w-4 h-4" />
            <span>Saved!</span>
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Work Window Start</label>
            <input
              type="time"
              value={workStartTime}
              onChange={(e) => setWorkStartTime(e.target.value)}
              className="w-full bg-[#0B0F19] border border-[#1F2C4C] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Work Window End</label>
            <input
              type="time"
              value={workEndTime}
              onChange={(e) => setWorkEndTime(e.target.value)}
              className="w-full bg-[#0B0F19] border border-[#1F2C4C] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Focus Block (min)</label>
            <input
              type="number"
              min={15}
              max={180}
              step={5}
              value={focusMinutes}
              onChange={(e) => setFocusMinutes(Number(e.target.value))}
              className="w-full bg-[#0B0F19] border border-[#1F2C4C] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Break Duration (min)</label>
            <input
              type="number"
              min={5}
              max={60}
              step={5}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Number(e.target.value))}
              className="w-full bg-[#0B0F19] border border-[#1F2C4C] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Event Buffer (min)</label>
            <input
              type="number"
              min={0}
              max={30}
              step={5}
              value={bufferMinutes}
              onChange={(e) => setBufferMinutes(Number(e.target.value))}
              className="w-full bg-[#0B0F19] border border-[#1F2C4C] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-slate-300 font-semibold mb-1">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full bg-[#0B0F19] border border-[#1F2C4C] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500"
          >
            <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30 - Hackathon Reference)</option>
            <option value="UTC">UTC (Universal Coordinated Time)</option>
            <option value="America/New_York">America/New_York (EST / EDT)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (PST / PDT)</option>
            <option value="Europe/London">Europe/London (GMT / BST)</option>
          </select>
        </div>

        <div className="pt-4 border-t border-[#1F2C4C] flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-md shadow-sky-600/20 active:scale-95 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </form>
    </div>
  );
}
