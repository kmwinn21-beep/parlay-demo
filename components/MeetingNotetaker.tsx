'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  speaker?: string;
}

interface Insight {
  id: number;
  insight_type: string;
  content: string;
  quote: string | null;
  timestamp_seconds: number | null;
  confidence: string;
  confirmed: boolean;
}

interface NextStepItem {
  task_text: string;
  timestamp_seconds?: number;
  suggested_owner?: string;
  suggested_due_date_offset_days?: number;
}

interface MeetingContext {
  id: number;
  attendee_id: number;
  conference_id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  company_name: string | null;
  company_icp: string | null;
  conference_name: string;
  scheduled_by: string | null;
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

interface Props {
  meetingId: number;
  onClose?: () => void;
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const map: Record<string, string> = {
    high: 'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${map[confidence] ?? map.medium}`}>
      {confidence}
    </span>
  );
}

function IcpTierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const t = tier.toLowerCase();
  let cls = 'bg-gray-100 text-gray-600';
  if (t === 'yes' || t === 'must target') cls = 'bg-red-100 text-red-700';
  else if (t === 'high priority') cls = 'bg-blue-100 text-blue-700';
  else if (t === 'worth engaging') cls = 'bg-green-100 text-green-700';
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>{tier}</span>;
}

export function MeetingNotetaker({ meetingId, onClose }: Props) {
  const router = useRouter();

  // Data state
  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<MeetingContext | null>(null);
  const [notesText, setNotesText] = useState('');
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [summary, setSummary] = useState('');
  const [nextSteps, setNextSteps] = useState<NextStepItem[]>([]);

  // Audio state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  // UI state
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());

  // Drag and drop
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load initial data
  useEffect(() => {
    async function load() {
      try {
        const [meetingDetailRes, notesRes] = await Promise.all([
          fetch(`/api/meetings/${meetingId}`),
          fetch(`/api/meetings/${meetingId}/notes`),
        ]);

        if (meetingDetailRes.ok) {
          const m = await meetingDetailRes.json();
          setMeeting(m);
        }

        if (notesRes.ok) {
          const data = await notesRes.json();
          setNotesText(data.notes_text ?? '');
          setSummary(data.summary ?? '');
          if (data.audio_file_path) {
            setAudioUrl(data.audio_file_path);
          }
          if (data.transcript) {
            try {
              const parsed = JSON.parse(data.transcript);
              if (Array.isArray(parsed)) setTranscript(parsed);
            } catch {
              // not JSON, ignore
            }
          }
          if (data.insights?.length) {
            setInsights(data.insights);
          }
        }
      } catch (e) {
        console.error('Failed to load meeting notes:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [meetingId]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setAudioCurrentTime(audio.currentTime);
    const onDurationChange = () => setAudioDuration(audio.duration || 0);
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('loadedmetadata', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('loadedmetadata', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [audioUrl]);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play().catch(console.error);
  }, [isPlaying]);

  const scrubTo = useCallback((secs: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = secs;
    setAudioCurrentTime(secs);
  }, []);

  // Recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start(1000);
      setRecordingState('recording');
      setRecordingElapsed(0);
      recordingTimerRef.current = setInterval(() => setRecordingElapsed(e => e + 1), 1000);
    } catch (e) {
      toast.error('Could not access microphone.');
      console.error(e);
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setRecordingState('paused');
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setRecordingState('recording');
      recordingTimerRef.current = setInterval(() => setRecordingElapsed(e => e + 1), 1000);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecordingState('stopped');
  }, []);

  // File upload
  const handleFile = useCallback((file: File) => {
    const allowed = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/m4a', 'audio/wav', 'audio/ogg', 'audio/x-m4a'];
    if (!allowed.includes(file.type)) {
      toast.error('Unsupported file type. Use MP3, MP4, M4A, WAV, or WebM.');
      return;
    }
    const url = URL.createObjectURL(file);
    setAudioBlob(file);
    setAudioUrl(url);
    toast.success('Audio file loaded.');
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!audioBlob && !audioUrl) {
      toast.error('No audio to analyze.');
      return;
    }
    setAnalysisLoading(true);
    try {
      let r2Url = audioUrl;

      // Upload blob to R2 if we have a local blob
      if (audioBlob) {
        const formData = new FormData();
        const ext = audioBlob.type.split('/')[1] || 'webm';
        formData.append('file', new File([audioBlob], `recording.${ext}`, { type: audioBlob.type }));
        const uploadRes = await fetch(`/api/meetings/${meetingId}/audio`, {
          method: 'POST',
          body: formData,
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({ error: 'Upload failed' }));
          throw new Error(err.error ?? 'Upload failed');
        }
        const { url } = await uploadRes.json();
        r2Url = url;
      }

      if (!r2Url) throw new Error('No audio URL');

      const analyzeRes = await fetch(`/api/meetings/${meetingId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: r2Url }),
      });

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json().catch(() => ({ error: 'Analysis failed' }));
        throw new Error(err.error ?? 'Analysis failed');
      }

      const data = await analyzeRes.json();
      setInsights(data.insights ?? []);
      setSummary(data.summary ?? '');
      if (data.transcript?.length) setTranscript(data.transcript);
      if (data.next_steps?.length) setNextSteps(data.next_steps);
      toast.success('Analysis complete!');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Analysis failed';
      toast.error(msg);
      console.error(e);
    } finally {
      setAnalysisLoading(false);
    }
  }, [audioBlob, audioUrl, meetingId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes_text: notesText,
          transcript: transcript.length ? JSON.stringify(transcript) : null,
          summary,
          audio_file_path: audioUrl && !audioUrl.startsWith('blob:') ? audioUrl : null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Notes saved.');
    } catch {
      toast.error('Failed to save notes.');
    } finally {
      setSaving(false);
    }
  }, [meetingId, notesText, transcript, summary, audioUrl]);

  const handleConfirmInsight = useCallback(async (insightId: number) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/insights/${insightId}/confirm`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setInsights(prev => prev.map(i => i.id === insightId ? { ...i, confirmed: data.confirmed } : i));
    } catch {
      toast.error('Failed to update insight.');
    }
  }, [meetingId]);

  const handleConfirmTasks = useCallback(async () => {
    const selectedSteps = nextSteps.filter((_, i) => selectedTaskIds.has(i));
    if (selectedSteps.length === 0) {
      toast.error('Select at least one task.');
      return;
    }
    try {
      const res = await fetch(`/api/meetings/${meetingId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: selectedSteps.map(s => ({
            task_text: s.task_text,
            due_date_offset_days: s.suggested_due_date_offset_days,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Tasks created as follow-ups!');
      setSelectedTaskIds(new Set());
    } catch {
      toast.error('Failed to create tasks.');
    }
  }, [meetingId, nextSteps, selectedTaskIds]);

  const buyingSignals = insights.filter(i => i.insight_type === 'buying_signal');
  const painPoints = insights.filter(i => i.insight_type === 'pain_point');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          {onClose ? (
            <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <button onClick={() => router.back()} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <h1 className="text-sm font-semibold text-gray-800">
              {meeting ? `Meeting Notes — ${meeting.first_name} ${meeting.last_name}` : 'Meeting Notes'}
            </h1>
            {meeting && (
              <p className="text-xs text-gray-500">{meeting.conference_name}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 bg-brand-secondary text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Timeline scrubber */}
      {audioUrl && (
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={togglePlayback} className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-secondary text-white flex items-center justify-center hover:bg-blue-700 transition-colors">
              {isPlaying ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            <span className="text-xs text-gray-500 w-10 flex-shrink-0 font-mono">{formatTime(audioCurrentTime)}</span>
            <div
              className="relative flex-1 h-2 bg-gray-200 rounded-full cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                scrubTo(pct * audioDuration);
              }}
            >
              <div
                className="absolute left-0 top-0 h-2 bg-brand-secondary rounded-full"
                style={{ width: audioDuration > 0 ? `${(audioCurrentTime / audioDuration) * 100}%` : '0%' }}
              />
              {/* Insight markers */}
              {insights.filter(i => i.timestamp_seconds != null && audioDuration > 0).map(i => (
                <button
                  key={i.id}
                  className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full -ml-1 ${
                    i.insight_type === 'buying_signal' ? 'bg-green-500' :
                    i.insight_type === 'pain_point' ? 'bg-orange-500' : 'bg-blue-400'
                  }`}
                  style={{ left: `${(i.timestamp_seconds! / audioDuration) * 100}%` }}
                  onClick={(e) => { e.stopPropagation(); scrubTo(i.timestamp_seconds!); }}
                  title={i.content}
                />
              ))}
            </div>
            <span className="text-xs text-gray-500 w-10 flex-shrink-0 font-mono text-right">{formatTime(audioDuration)}</span>
          </div>
          <audio ref={audioRef} src={audioUrl} className="hidden" />
        </div>
      )}
      {!audioUrl && <audio ref={audioRef} src={audioUrl ?? undefined} className="hidden" />}

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col lg:grid lg:grid-cols-[auto_1fr_1fr] h-full min-h-0">

          {/* Context Panel */}
          <div className={`border-b lg:border-b-0 lg:border-r border-gray-200 transition-all duration-200 ${contextCollapsed ? 'lg:w-8' : 'lg:w-64'} flex-shrink-0`}>
            <div className="flex items-center justify-between p-3 border-b border-gray-100">
              {!contextCollapsed && <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Context</span>}
              <button
                onClick={() => setContextCollapsed(c => !c)}
                className="ml-auto p-1 rounded hover:bg-gray-100 text-gray-400"
                title={contextCollapsed ? 'Expand' : 'Collapse'}
              >
                <svg className={`w-4 h-4 transition-transform ${contextCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>
            {!contextCollapsed && meeting && (
              <div className="p-3 space-y-3">
                {/* Conference badge */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Conference</p>
                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                    {meeting.conference_name}
                  </span>
                </div>
                {/* Company */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Company</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-gray-800">{meeting.company_name ?? '—'}</span>
                    <IcpTierBadge tier={meeting.company_icp} />
                  </div>
                </div>
                {/* Attendee */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Attendee</p>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
                      {meeting.first_name?.[0]}{meeting.last_name?.[0]}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-800">{meeting.first_name} {meeting.last_name}</p>
                      {meeting.title && <p className="text-[10px] text-gray-500">{meeting.title}</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notes + Recording column */}
          <div className="border-b lg:border-b-0 lg:border-r border-gray-200 overflow-auto">
            <div className="p-4 space-y-4">
              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes</label>
                <textarea
                  value={notesText}
                  onChange={e => setNotesText(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-secondary resize-none"
                  rows={6}
                  placeholder="Free-form meeting notes…"
                />
              </div>

              {/* Recording section */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Recording</p>
                {recordingState === 'idle' && !audioUrl && (
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={startRecording}
                      className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
                      title="Start Recording"
                    >
                      <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                      </svg>
                    </button>
                    <p className="text-xs text-gray-400">Tap to record</p>
                  </div>
                )}
                {(recordingState === 'recording' || recordingState === 'paused') && (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2">
                      {recordingState === 'recording' && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      )}
                      <span className="text-sm font-mono text-gray-700">{formatTime(recordingElapsed)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {recordingState === 'recording' ? (
                        <button onClick={pauseRecording} className="px-3 py-1.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-lg hover:bg-yellow-200 transition-colors">
                          Pause
                        </button>
                      ) : (
                        <button onClick={resumeRecording} className="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-semibold rounded-lg hover:bg-green-200 transition-colors">
                          Resume
                        </button>
                      )}
                      <button onClick={stopRecording} className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-200 transition-colors">
                        Stop
                      </button>
                    </div>
                  </div>
                )}
                {(recordingState === 'stopped' || (audioUrl && recordingState === 'idle')) && (
                  <div className="space-y-3">
                    {/* Waveform placeholder */}
                    <div className="h-10 bg-gray-100 rounded-lg flex items-center px-3 gap-0.5 overflow-hidden">
                      {Array.from({ length: 40 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-full bg-brand-secondary opacity-60"
                          style={{ height: `${20 + Math.sin(i * 0.8) * 12 + Math.cos(i * 1.2) * 8}%` }}
                        />
                      ))}
                    </div>
                    {!analysisLoading && (
                      <button
                        onClick={handleAnalyze}
                        className="w-full py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        Analyze with AI
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Upload section */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">or upload audio</p>
                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${dragOver ? 'border-brand-secondary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleFile(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg className="w-6 h-6 text-gray-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-xs text-gray-500">Drag & drop or click to upload</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">MP3, MP4, M4A, WAV, WebM</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,.mp4,.m4a,.wav,.webm,audio/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>

              {/* Transcript section */}
              {transcript.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <button
                    onClick={() => setTranscriptExpanded(e => !e)}
                    className="flex items-center gap-2 text-xs font-semibold text-gray-600 w-full"
                  >
                    <svg className={`w-4 h-4 transition-transform ${transcriptExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Transcript ({transcript.length} segments)
                  </button>
                  {transcriptExpanded && (
                    <div className="mt-2 space-y-1 max-h-60 overflow-auto">
                      {transcript.map((seg, i) => {
                        const hasBuyingSignal = insights.some(ins => ins.insight_type === 'buying_signal' && ins.timestamp_seconds != null && ins.timestamp_seconds >= seg.start && ins.timestamp_seconds <= seg.end);
                        const hasPainPoint = insights.some(ins => ins.insight_type === 'pain_point' && ins.timestamp_seconds != null && ins.timestamp_seconds >= seg.start && ins.timestamp_seconds <= seg.end);
                        return (
                          <div key={i} className={`flex gap-2 p-1.5 rounded text-xs ${hasBuyingSignal ? 'bg-green-50' : hasPainPoint ? 'bg-orange-50' : ''}`}>
                            <button
                              onClick={() => scrubTo(seg.start)}
                              className="flex-shrink-0 text-[10px] font-mono text-blue-500 hover:text-blue-700 underline"
                            >
                              {formatTime(seg.start)}
                            </button>
                            <span className="text-gray-700">{seg.text.trim()}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* AI Analysis column */}
          <div className="overflow-auto">
            <div className="p-4">
              {analysisLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">Analyzing with AI…</p>
                </div>
              )}

              {!analysisLoading && insights.length === 0 && nextSteps.length === 0 && !summary && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p className="text-sm text-gray-400">Record or upload audio, then click Analyze with AI to extract insights.</p>
                </div>
              )}

              {!analysisLoading && (insights.length > 0 || nextSteps.length > 0 || summary) && (
                <div className="space-y-5">

                  {/* Next Steps */}
                  {nextSteps.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Next Steps</h3>
                      <div className="space-y-2">
                        {nextSteps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2 p-2.5 bg-white border border-gray-200 rounded-lg">
                            <input
                              type="checkbox"
                              checked={selectedTaskIds.has(i)}
                              onChange={e => {
                                const next = new Set(selectedTaskIds);
                                if (e.target.checked) next.add(i);
                                else next.delete(i);
                                setSelectedTaskIds(next);
                              }}
                              className="mt-0.5 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-700">{step.task_text}</p>
                              {step.suggested_owner && (
                                <p className="text-[10px] text-gray-400 mt-0.5">Owner: {step.suggested_owner}</p>
                              )}
                              {step.suggested_due_date_offset_days != null && (
                                <p className="text-[10px] text-gray-400">Due: +{step.suggested_due_date_offset_days} days</p>
                              )}
                            </div>
                            {step.timestamp_seconds != null && audioDuration > 0 && (
                              <button onClick={() => scrubTo(step.timestamp_seconds!)} className="text-[10px] font-mono text-blue-500 hover:underline flex-shrink-0">
                                {formatTime(step.timestamp_seconds)}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {nextSteps.length > 0 && (
                        <button
                          onClick={handleConfirmTasks}
                          disabled={selectedTaskIds.size === 0}
                          className="mt-2 w-full py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40"
                        >
                          Confirm selected tasks ({selectedTaskIds.size})
                        </button>
                      )}
                    </div>
                  )}

                  {/* Buying Signals */}
                  {buyingSignals.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Buying Signals</h3>
                      <div className="space-y-2">
                        {buyingSignals.map(ins => (
                          <div key={ins.id} className={`p-2.5 rounded-lg border text-xs ${ins.confirmed ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium text-gray-800">{ins.content}</span>
                                <ConfidenceBadge confidence={ins.confidence} />
                                {!ins.confirmed && <span className="text-[10px] text-gray-400 italic">Unconfirmed</span>}
                                {ins.confirmed && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-green-700 font-semibold">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                    Confirmed
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {ins.timestamp_seconds != null && audioDuration > 0 && (
                                  <button onClick={() => scrubTo(ins.timestamp_seconds!)} className="text-[10px] font-mono text-blue-500 hover:underline">
                                    {formatTime(ins.timestamp_seconds)}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleConfirmInsight(ins.id)}
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold transition-colors ${ins.confirmed ? 'bg-green-200 text-green-700 hover:bg-green-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                >
                                  {ins.confirmed ? 'Confirmed' : 'Confirm'}
                                </button>
                              </div>
                            </div>
                            {ins.quote && (
                              <blockquote className="text-[11px] text-gray-500 italic border-l-2 border-gray-200 pl-2 mt-1">
                                &ldquo;{ins.quote}&rdquo;
                              </blockquote>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pain Points */}
                  {painPoints.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Pain Points</h3>
                      <div className="space-y-2">
                        {painPoints.map(ins => (
                          <div key={ins.id} className="p-2.5 rounded-lg border border-gray-200 bg-white text-xs">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium text-gray-800">{ins.content}</span>
                                <ConfidenceBadge confidence={ins.confidence} />
                              </div>
                              {ins.timestamp_seconds != null && audioDuration > 0 && (
                                <button onClick={() => scrubTo(ins.timestamp_seconds!)} className="text-[10px] font-mono text-blue-500 hover:underline flex-shrink-0">
                                  {formatTime(ins.timestamp_seconds)}
                                </button>
                              )}
                            </div>
                            {ins.quote && (
                              <blockquote className="text-[11px] text-gray-500 italic border-l-2 border-orange-200 pl-2 mt-1">
                                &ldquo;{ins.quote}&rdquo;
                              </blockquote>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Meeting Summary */}
                  {summary && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Meeting Summary</h3>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 leading-relaxed">
                        {summary}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
