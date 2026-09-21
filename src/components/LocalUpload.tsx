'use client';

import React, { useState, useRef } from 'react';
import { useAudioX } from '@/context/AudioXContext';
import { FormatSelector } from './FormatSelector';
import { QualitySelector } from './QualitySelector';
import { AudioFormat, AudioQuality } from '@/lib/types';
import { UploadCloud, FileAudio, AlertCircle, Plus, CheckCircle2 } from 'lucide-react';

interface LocalUploadProps {
  onDone?: () => void;
}

export function LocalUpload({ onDone }: LocalUploadProps) {
  const { settings, addSingleJob } = useAudioX();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [format, setFormat] = useState<AudioFormat>(settings.defaultFormat);
  const [quality, setQuality] = useState<AudioQuality>(settings.defaultQuality);
  const [isSuccess, setIsSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    setUploadError(null);
    const allowed = ['.mp4', '.mov', '.webm', '.mkv', '.mp3', '.m4a', '.wav', '.aac'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!allowed.includes(ext)) {
      setUploadError(`Unsupported file format (${ext}). Supported: MP4, MOV, WEBM, MKV, MP3, M4A, WAV, AAC.`);
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      setUploadError('File size exceeds maximum limit of 500 MB.');
      return;
    }

    setSelectedFile(file);
  };

  const handleUploadAndQueue = async () => {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const { filePath, analysis } = await res.json();
      const meta = analysis.single;

      await addSingleJob({
        sourceUrl: filePath,
        mediaId: meta.id,
        title: meta.title,
        artist: 'Local File',
        duration: meta.duration,
        format,
        quality,
        source: 'local',
      });

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setSelectedFile(null);
        onDone?.();
      }, 1500);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload and queue file.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,.mov,.webm,.mkv,.mp3,.m4a,.wav,.aac"
        onChange={handleChange}
        className="hidden"
      />

      {!selectedFile ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center p-8 sm:p-12 rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer select-none ${
            dragActive
              ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]'
              : 'border-white/[0.12] bg-zinc-900/40 hover:border-white/[0.2] hover:bg-zinc-900/60'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-indigo-400 mb-4">
            <UploadCloud size={28} />
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-white text-center">
            Drag & drop media file here, or browse
          </h3>
          <p className="text-xs text-zinc-500 mt-1.5 text-center max-w-xs">
            Supports MP4, MOV, WEBM, MKV, MP3, M4A, WAV, AAC (Up to 500 MB)
          </p>
        </div>
      ) : (
        <div className="rounded-2xl glass-panel p-5 sm:p-6 border border-white/[0.08] shadow-2xl">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <FileAudio size={24} />
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-sm sm:text-base font-semibold text-white truncate">
                {selectedFile.name}
              </h4>
              <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded bg-white/5"
            >
              Change
            </button>
          </div>

          <div className="mt-5 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-medium">Format:</span>
              <FormatSelector value={format} onChange={setFormat} size="sm" />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-medium">Bitrate:</span>
              <QualitySelector value={quality} onChange={setQuality} size="sm" />
            </div>
          </div>

          <button
            type="button"
            onClick={handleUploadAndQueue}
            disabled={isUploading || isSuccess}
            className={`mt-5 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white transition-all duration-200 cursor-pointer shadow-lg disabled:opacity-50 ${
              isSuccess
                ? 'bg-emerald-500'
                : 'gradient-accent hover:opacity-95 active:scale-[0.98] shadow-indigo-600/25'
            }`}
          >
            {isUploading ? (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                <span>Uploading & Queueing...</span>
              </div>
            ) : isSuccess ? (
              <>
                <CheckCircle2 size={16} />
                <span>Added to Queue</span>
              </>
            ) : (
              <>
                <Plus size={16} />
                <span>Convert & Add to Queue</span>
              </>
            )}
          </button>
        </div>
      )}

      {uploadError && (
        <div className="mt-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2.5 text-xs text-red-300">
          <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">{uploadError}</div>
        </div>
      )}
    </div>
  );
}
