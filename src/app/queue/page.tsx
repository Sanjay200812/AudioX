'use client';

import React from 'react';
import Link from 'next/link';
import { useAudioX } from '@/context/AudioXContext';
import { ActiveJobCard } from '@/components/ActiveJobCard';
import { QueueJobCard } from '@/components/QueueJobCard';
import { BrowserBlockedNotice } from '@/components/BrowserBlockedNotice';
import {
  ListOrdered,
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Disc3,
  SkipForward,
  ArrowRight,
  PartyPopper,
  Play,
} from 'lucide-react';

export default function QueuePage() {
  const {
    jobs,
    activeJob,
    queuedJobs,
    completedJobs,
    failedJobs,
    skippedJobs,
    clearPendingQueue,
    retryJob,
    startQueue,
  } = useAudioX();

  const totalCount = jobs.length;
  const isQueueEmpty = totalCount === 0;

  // Active track playlist position
  const activePosition = activeJob?.playlistIndex || (completedJobs.length + 1);
  const remainingCount = queuedJobs.length + (activeJob ? 1 : 0);
  const isAllFinished = !activeJob && queuedJobs.length === 0 && (completedJobs.length > 0 || failedJobs.length > 0);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 py-4">
      <BrowserBlockedNotice />

      {/* Header & Status Counters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
            <ListOrdered className="text-indigo-400" size={28} />
            <span>Download Queue</span>
          </h1>

          {activeJob ? (
            <p className="text-xs sm:text-sm font-semibold text-indigo-300 mt-1">
              Downloading {activePosition} of {totalCount}
            </p>
          ) : (
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Sequential audio conversion • 1 track at a time • No ZIP bundling
            </p>
          )}
        </div>

        {/* Counter Badges */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900 border border-white/[0.06] text-zinc-300 font-medium">
            <Clock size={12} className="text-zinc-400" />
            <span>Completed: {completedJobs.length}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
            <span>Remaining: {remainingCount}</span>
          </div>

          {failedJobs.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 font-medium">
              <AlertCircle size={12} className="text-red-400" />
              <span>Failed: {failedJobs.length}</span>
            </div>
          )}

          {skippedJobs.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-medium">
              <SkipForward size={12} className="text-amber-400" />
              <span>Skipped: {skippedJobs.length}</span>
            </div>
          )}

          {!activeJob && queuedJobs.length > 0 && (
            <button
              type="button"
              onClick={startQueue}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md transition-colors cursor-pointer"
            >
              <Play size={12} className="fill-white" />
              <span>Start Queue</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {isQueueEmpty ? (
        <div className="rounded-2xl glass-panel p-10 sm:p-16 border border-white/[0.08] flex flex-col items-center justify-center text-center my-6">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-500 mb-4">
            <Disc3 size={32} />
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">Nothing queued yet</h3>
          <p className="text-xs text-zinc-400 max-w-sm mt-1.5 mb-6 leading-relaxed">
            Paste a YouTube video or playlist link on the Home page to start queuing individual audio tracks.
          </p>
          <Link
            href="/"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-white gradient-accent shadow-lg shadow-indigo-600/25 hover:opacity-95 transition-all"
          >
            <Plus size={16} />
            <span>Add Audio to Queue</span>
          </Link>
        </div>
      ) : (
        <>
          {/* Playlist Queue Finished Screen */}
          {isAllFinished && (() => {
            const isAllFailed = totalCount > 0 && failedJobs.length === totalCount;
            const isMixed = failedJobs.length > 0 && completedJobs.length > 0;

            let finishTitle = 'Playlist Download Complete';
            let finishBorderColor = 'border-emerald-500/30 bg-emerald-950/20';
            let finishIconBg = 'bg-emerald-500/20 text-emerald-400';
            let FinishIcon = PartyPopper;

            if (isAllFailed) {
              finishTitle = 'Download Failed';
              finishBorderColor = 'border-red-500/30 bg-red-950/20';
              finishIconBg = 'bg-red-500/20 text-red-400';
              FinishIcon = AlertCircle;
            } else if (isMixed || failedJobs.length > 0) {
              finishTitle = 'Queue Finished with Errors';
              finishBorderColor = 'border-amber-500/30 bg-amber-950/20';
              finishIconBg = 'bg-amber-500/20 text-amber-400';
              FinishIcon = AlertCircle;
            }

            return (
              <div className={`p-6 sm:p-8 rounded-2xl glass-panel border ${finishBorderColor} shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in-95`}>
                <div className={`w-14 h-14 rounded-2xl ${finishIconBg} flex items-center justify-center mb-3`}>
                  <FinishIcon size={28} />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {finishTitle}
                </h2>
                <p className="text-xs sm:text-sm text-zinc-300 mt-1">
                  {totalCount} total tracks processed
                </p>

                <div className="flex items-center gap-4 my-4 text-xs font-semibold">
                  <span className="text-emerald-400">{completedJobs.length} Downloaded</span>
                  {failedJobs.length > 0 && <span className="text-red-400">{failedJobs.length} Failed</span>}
                  {skippedJobs.length > 0 && <span className="text-amber-400">{skippedJobs.length} Skipped</span>}
                </div>

                <div className="flex items-center gap-3 mt-2 flex-wrap justify-center">
                  {failedJobs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => failedJobs.forEach((j) => retryJob(j.id))}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors shadow-sm cursor-pointer"
                    >
                      <RotateCcw size={14} />
                      <span>Retry {failedJobs.length} Failed</span>
                    </button>
                  )}

                  <Link
                    href="/downloads"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-sm"
                  >
                    <span>View Downloads</span>
                    <ArrowRight size={14} />
                  </Link>

                  <Link
                    href="/"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white bg-white/10 hover:bg-white/15 transition-colors"
                  >
                    <span>Back Home</span>
                  </Link>
                </div>
              </div>
            );
          })()}

          {/* Currently Converting Card */}
          {activeJob && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 px-1">
                Currently Converting
              </span>
              <ActiveJobCard job={activeJob} totalInPlaylist={totalCount} />
            </div>
          )}

          {/* Up Next List */}
          {queuedJobs.length > 0 && (
            <div className="flex flex-col gap-3 mt-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Up Next ({queuedJobs.length})
                </span>

                <button
                  type="button"
                  onClick={clearPendingQueue}
                  className="text-xs text-zinc-400 hover:text-red-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Clear Pending Queue</span>
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {queuedJobs.map((job, idx) => (
                  <QueueJobCard
                    key={job.id}
                    job={job}
                    index={idx}
                    isFirst={idx === 0}
                    isLast={idx === queuedJobs.length - 1}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Failed & Skipped Items */}
          {(failedJobs.length > 0 || skippedJobs.length > 0) && (
            <div className="flex flex-col gap-3 mt-4 p-4 rounded-2xl bg-red-500/[0.04] border border-red-500/15">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-red-300 flex items-center gap-1.5">
                  <AlertCircle size={14} />
                  Failed & Skipped Tracks ({failedJobs.length + skippedJobs.length})
                </span>

                <button
                  type="button"
                  onClick={() => {
                    failedJobs.forEach((j) => retryJob(j.id));
                    skippedJobs.forEach((j) => retryJob(j.id));
                  }}
                  className="text-xs text-red-300 hover:text-white flex items-center gap-1.5 cursor-pointer font-semibold"
                >
                  <RotateCcw size={13} />
                  <span>Retry All</span>
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {failedJobs.map((job, idx) => (
                  <QueueJobCard key={job.id} job={job} index={idx} isFirst={false} isLast={false} />
                ))}
                {skippedJobs.map((job, idx) => (
                  <QueueJobCard key={job.id} job={job} index={idx} isFirst={false} isLast={false} />
                ))}
              </div>
            </div>
          )}

          {/* Completed Items */}
          {completedJobs.length > 0 && !isAllFinished && (
            <div className="flex flex-col gap-3 mt-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Completed in this Session ({completedJobs.length})
                </span>
                <Link
                  href="/downloads"
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  View Download History →
                </Link>
              </div>

              <div className="flex flex-col gap-2">
                {completedJobs.map((job, idx) => (
                  <QueueJobCard key={job.id} job={job} index={idx} isFirst={false} isLast={false} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
