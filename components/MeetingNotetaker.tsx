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
  company_id: number | null;
  company_name: string | null;
  company_icp: string | null;
  conference_name: string;
  conference_internal_attendees: string | null;
  scheduled_by: string | null;
  additional_attendees: string | null;
  meeting_date: string | null;
  meeting_time: string | null;
}

interface AttendeeResult {
  id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  company_name: string | null;
}

interface UserOption {
  id: number;
  value: string;
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

interface Props {
  meetingId: number;
  onClose?: () => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
  onMeetingLoaded?: (label: string) => void;
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatMeetingDate(d: string | null) {
  if (!d) return '';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

function IcpBadge({ icp }: { icp: string | null }) {
  if (!icp || icp.toLowerCase() === 'no') return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
      ICP Match
    </span>
  );
}

function Avatar({ name, size = 7 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={`w-${size} h-${size} rounded-full bg-brand-secondary/20 flex items-center justify-center text-[10px] font-bold text-brand-secondary flex-shrink-0`}>
      {initials}
    </div>
  );
}

// ─── External Attendee Form ──────────────────────────────────────────────────

interface ExternalAttendeeFormProps {
  conferenceId: number;
  defaultCompanyId: number | null;
  defaultCompanyName: string | null;
  onAdd: (name: string) => void;
  onCancel: () => void;
}

interface AttendeeResultWithSource extends AttendeeResult {
  isConferenceAttendee: boolean;
}

function ExternalAttendeeForm({ conferenceId, defaultCompanyId, defaultCompanyName, onAdd, onCancel }: ExternalAttendeeFormProps) {
  const [tab, setTab] = useState<'search' | 'create'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AttendeeResultWithSource[]>([]);
  const [searching, setSearching] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newCompanyName, setNewCompanyName] = useState(defaultCompanyName ?? '');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (tab !== 'search' || query.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const params = encodeURIComponent(query);
        const [confRes, companyRes] = await Promise.all([
          fetch(`/api/attendees?conference_id=${conferenceId}&search=${params}&limit=10`),
          defaultCompanyId
            ? fetch(`/api/attendees?company_id=${defaultCompanyId}&search=${params}&limit=10`)
            : Promise.resolve(null),
        ]);
        const confJson = confRes.ok ? await confRes.json() : null;
        const companyJson = companyRes?.ok ? await companyRes.json() : null;
        const confData: AttendeeResult[] = confJson ? (confJson.attendees ?? confJson) : [];
        const companyData: AttendeeResult[] = companyJson ? (companyJson.attendees ?? companyJson) : [];
        const confIds = new Set(confData.map(a => a.id));
        const merged: AttendeeResultWithSource[] = [
          ...confData.map(a => ({ ...a, isConferenceAttendee: true })),
          ...companyData.filter(a => !confIds.has(a.id)).map(a => ({ ...a, isConferenceAttendee: false })),
        ];
        setResults(merged.slice(0, 12));
      } catch { /* ignore */ }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, conferenceId, defaultCompanyId, tab]);

  const associateWithConference = async (attendeeId: number) => {
    await fetch('/api/conference-attendees/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conference_ids: [conferenceId], attendee_ids: [attendeeId] }),
    });
  };

  const handleSelectResult = async (a: AttendeeResultWithSource) => {
    if (!a.isConferenceAttendee) {
      await associateWithConference(a.id).catch(() => { /* non-blocking */ });
    }
    onAdd(`${a.first_name} ${a.last_name}`);
  };

  const handleCreate = async () => {
    if (!newFirst.trim() || !newLast.trim()) { toast.error('First and last name required.'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/attendees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: newFirst.trim(),
          last_name: newLast.trim(),
          title: newTitle.trim() || null,
          company_name: newCompanyName.trim() || null,
          company_id: defaultCompanyId,
          conference_id: conferenceId,
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      if (created?.id) {
        await associateWithConference(created.id).catch(() => { /* non-blocking */ });
      }
      toast.success('Attendee created.');
      onAdd(`${newFirst.trim()} ${newLast.trim()}`);
    } catch {
      toast.error('Failed to create attendee.');
    } finally {
      setCreating(false);
    }
  };

  const inputCls = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-secondary';

  return (
    <div className="mt-2 border border-gray-200 rounded-lg bg-gray-50 p-3 space-y-2">
      <div className="flex gap-1">
        {(['search', 'create'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-colors ${tab === t ? 'bg-brand-secondary text-white' : 'bg-white text-gray-500 border border-gray-200'}`}
          >
            {t === 'search' ? 'Search' : 'Create New'}
          </button>
        ))}
      </div>

      {tab === 'search' && (
        <div>
          <input
            className={inputCls}
            placeholder="Search attendees…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          {searching && <p className="text-[10px] text-gray-400 mt-1">Searching…</p>}
          {results.length > 0 && (
            <ul className="mt-1 max-h-36 overflow-auto border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
              {results.map(a => (
                <li key={a.id}>
                  <button
                    className="w-full text-left px-2.5 py-2 text-xs hover:bg-blue-50 transition-colors"
                    onClick={() => handleSelectResult(a)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-800">{a.first_name} {a.last_name}</span>
                      {!a.isConferenceAttendee && (
                        <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700">Company</span>
                      )}
                    </div>
                    {a.title && <span className="text-gray-400">{a.title}</span>}
                    {a.company_name && <span className="text-gray-400 block text-[10px]">{a.company_name}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.length >= 2 && !searching && results.length === 0 && (
            <p className="text-[10px] text-gray-400 mt-1">No attendees found. Try creating a new one.</p>
          )}
        </div>
      )}

      {tab === 'create' && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <input className={inputCls} placeholder="First name *" value={newFirst} onChange={e => setNewFirst(e.target.value)} />
            <input className={inputCls} placeholder="Last name *" value={newLast} onChange={e => setNewLast(e.target.value)} />
          </div>
          <input className={inputCls} placeholder="Title (optional)" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
          <input className={inputCls} placeholder="Company" value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} />
          <button
            onClick={handleCreate}
            disabled={creating || !newFirst.trim() || !newLast.trim()}
            className="w-full py-1.5 bg-brand-secondary text-white text-[10px] font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {creating ? 'Creating…' : 'Create & Add'}
          </button>
        </div>
      )}

      <button onClick={onCancel} className="text-[10px] text-gray-400 hover:text-gray-600 w-full text-center">Cancel</button>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function MeetingNotetaker({ meetingId, onClose, onRecordingStateChange, onMeetingLoaded }: Props) {
  const router = useRouter();

  // Data state
  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<MeetingContext | null>(null);
  const [notesText, setNotesText] = useState('');
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [summary, setSummary] = useState('');
  const [nextSteps, setNextSteps] = useState<NextStepItem[]>([]);

  // Attendees state
  const [additionalAttendees, setAdditionalAttendees] = useState<string[]>([]);
  const [internalAttendees, setInternalAttendees] = useState<string[]>([]); // extra internal
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [showInternalPicker, setShowInternalPicker] = useState(false);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);

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
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showReplaceRecordingDialog, setShowReplaceRecordingDialog] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());

  // Drag and drop
  const [dragOver, setDragOver] = useState(false);
  const [dragOverText, setDragOverText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);

  // Load initial data
  useEffect(() => {
    async function load() {
      try {
        const [meetingDetailRes, notesRes, usersRes] = await Promise.all([
          fetch(`/api/meetings/${meetingId}`),
          fetch(`/api/meetings/${meetingId}/notes`),
          fetch('/api/config?category=user'),
        ]);

        if (meetingDetailRes.ok) {
          const m: MeetingContext = await meetingDetailRes.json();
          setMeeting(m);
          if (m.additional_attendees) {
            setAdditionalAttendees(
              m.additional_attendees.split(',').map(s => s.trim()).filter(Boolean)
            );
          }
        }

        if (notesRes.ok) {
          const data = await notesRes.json();
          setNotesText(data.notes_text ?? '');
          setSummary(data.summary ?? '');
          if (data.audio_file_path) setAudioUrl(data.audio_file_path);
          if (data.transcript) {
            try {
              const parsed = JSON.parse(data.transcript);
              if (Array.isArray(parsed)) setTranscript(parsed);
            } catch { /* not JSON */ }
          }
          if (data.insights?.length) setInsights(data.insights);
        }

        if (usersRes.ok) {
          const users: { id: number; value: string }[] = await usersRes.json();
          setAllUsers(users);
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

  // Notify parent of recording state changes (for minimized bar indicator)
  useEffect(() => {
    onRecordingStateChange?.(recordingState === 'recording');
  }, [recordingState, onRecordingStateChange]);

  // Notify parent of meeting label once loaded
  useEffect(() => {
    if (meeting) {
      onMeetingLoaded?.(`${meeting.first_name} ${meeting.last_name} — ${meeting.conference_name}`);
    }
  }, [meeting, onMeetingLoaded]);

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
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start(1000);
      setRecordingState('recording');
      setRecordingElapsed(0);
      recordingTimerRef.current = setInterval(() => setRecordingElapsed(e => e + 1), 1000);
    } catch {
      toast.error('Could not access microphone.');
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

  // Audio file upload
  const handleAudioFile = useCallback((file: File) => {
    const allowed = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/m4a', 'audio/wav', 'audio/ogg', 'audio/x-m4a'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(mp3|mp4|m4a|wav|webm)$/i)) {
      toast.error('Unsupported file type. Use MP3, MP4, M4A, WAV, or WebM.');
      return;
    }
    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
    toast.success('Audio file loaded.');
  }, []);

  // Text transcript upload
  const handleTextFile = useCallback((file: File) => {
    if (!file.name.match(/\.(txt|text|vtt|srt)$/i)) {
      toast.error('Unsupported format. Upload a .txt, .vtt, or .srt file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      // Parse into pseudo-segments (one per non-empty line)
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const segments: TranscriptSegment[] = lines.map((line, i) => ({
        text: line,
        start: i * 5,
        end: (i + 1) * 5,
      }));
      setTranscript(segments);
      setTranscriptExpanded(true);
      toast.success('Transcript loaded. Click "Analyze with AI" to extract insights.');
    };
    reader.readAsText(file);
  }, []);

  // Add external attendee
  const addExternalAttendee = useCallback(async (name: string) => {
    const updated = [...additionalAttendees, name];
    setAdditionalAttendees(updated);
    setShowExternalForm(false);
    try {
      await fetch(`/api/meetings/${meetingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_date: meeting?.meeting_date ?? '',
          meeting_time: meeting?.meeting_time ?? '',
          additional_attendees: updated.join(', '),
          scheduled_by: meeting?.scheduled_by ?? '',
        }),
      });
    } catch { /* silent — we still show the updated list */ }
  }, [additionalAttendees, meeting, meetingId]);

  const removeExternalAttendee = useCallback(async (name: string) => {
    const updated = additionalAttendees.filter(n => n !== name);
    setAdditionalAttendees(updated);
    try {
      await fetch(`/api/meetings/${meetingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_date: meeting?.meeting_date ?? '',
          meeting_time: meeting?.meeting_time ?? '',
          additional_attendees: updated.join(', '),
          scheduled_by: meeting?.scheduled_by ?? '',
        }),
      });
    } catch { /* silent */ }
  }, [additionalAttendees, meeting, meetingId]);

  const handleAnalyze = useCallback(async () => {
    const hasAudioBlob = !!audioBlob;
    const hasSavedAudio = !!(audioUrl && !audioUrl.startsWith('blob:'));
    const hasTranscript = transcript.length > 0;

    if (!hasAudioBlob && !hasTranscript && !hasSavedAudio) {
      toast.error('No audio or transcript to analyze.');
      return;
    }
    setAnalysisLoading(true);
    try {
      let r2Url: string | null = null;
      let transcriptPayload: string | null = null;

      if (hasAudioBlob) {
        // Fresh audio blob — upload to R2 then transcribe via Whisper
        const formData = new FormData();
        const ext = audioBlob!.type.split('/')[1] || 'webm';
        formData.append('file', new File([audioBlob!], `recording.${ext}`, { type: audioBlob!.type }));
        const uploadRes = await fetch(`/api/meetings/${meetingId}/audio`, { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error((await uploadRes.json().catch(() => ({}))).error ?? 'Upload failed');
        r2Url = (await uploadRes.json()).url;
      } else if (hasTranscript) {
        // Text transcript takes priority over any saved audio URL
        transcriptPayload = transcript.map(s => s.text).join('\n');
      } else {
        // Fall back to previously saved R2 audio URL
        r2Url = audioUrl;
      }

      const analyzeRes = await fetch(`/api/meetings/${meetingId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: r2Url, transcript_text: transcriptPayload }),
      });

      if (!analyzeRes.ok) throw new Error((await analyzeRes.json().catch(() => ({}))).error ?? 'Analysis failed');

      const data = await analyzeRes.json();
      setInsights(data.insights ?? []);
      setSummary(data.summary ?? '');
      if (data.transcript?.length) setTranscript(data.transcript);
      if (data.next_steps?.length) setNextSteps(data.next_steps);
      toast.success('Analysis complete!');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setAnalysisLoading(false);
    }
  }, [audioBlob, audioUrl, meetingId, transcript]);

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
      const res = await fetch(`/api/meetings/${meetingId}/insights/${insightId}/confirm`, { method: 'PATCH' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setInsights(prev => prev.map(i => i.id === insightId ? { ...i, confirmed: data.confirmed } : i));
    } catch {
      toast.error('Failed to update insight.');
    }
  }, [meetingId]);

  const handleConfirmTasks = useCallback(async () => {
    const selected = nextSteps.filter((_, i) => selectedTaskIds.has(i));
    if (!selected.length) { toast.error('Select at least one task.'); return; }
    try {
      const res = await fetch(`/api/meetings/${meetingId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: selected.map(s => ({ task_text: s.task_text, due_date_offset_days: s.suggested_due_date_offset_days })) }),
      });
      if (!res.ok) throw new Error();
      toast.success('Tasks created as follow-ups!');
      setSelectedTaskIds(new Set());
    } catch {
      toast.error('Failed to create tasks.');
    }
  }, [meetingId, nextSteps, selectedTaskIds]);

  const handleDeleteNotes = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/notes`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setNotesText('');
      setSummary('');
      setInsights([]);
      setNextSteps([]);
      setTranscript([]);
      setAudioUrl(null);
      setAudioBlob(null);
      setTranscriptExpanded(false);
      setShowDeleteConfirm(false);
      toast.success('Notes deleted.');
    } catch {
      toast.error('Failed to delete notes.');
    } finally {
      setDeleting(false);
    }
  }, [meetingId]);

  const buyingSignals = insights.filter(i => i.insight_type === 'buying_signal');
  const painPoints = insights.filter(i => i.insight_type === 'pain_point');
  const hasAudioOrTranscript = !!(audioUrl || audioBlob || transcript.length);

  // Derive scheduled_by display names and conference internal attendee names
  const scheduledByNames: string[] = (() => {
    if (!meeting?.scheduled_by) return [];
    const ids = meeting.scheduled_by.split(',').map(s => s.trim()).filter(Boolean);
    return ids.map(idStr => {
      const id = Number(idStr);
      const user = allUsers.find(u => u.id === id);
      return user ? user.value : idStr;
    });
  })();

  const conferenceInternalNames: string[] = meeting?.conference_internal_attendees
    ? meeting.conference_internal_attendees.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  // Users grouped: conference internal first, then others
  const usersGrouped = (() => {
    const confSet = new Set(conferenceInternalNames.map(n => n.toLowerCase()));
    const internal = allUsers.filter(u => confSet.has(u.value.toLowerCase()));
    const others = allUsers.filter(u => !confSet.has(u.value.toLowerCase()))
      .sort((a, b) => a.value.localeCompare(b.value));
    return { internal, others };
  })();

  const addInternalAttendee = (name: string) => {
    if (!internalAttendees.includes(name) && !scheduledByNames.includes(name)) {
      setInternalAttendees(prev => [...prev, name]);
    }
    setShowInternalPicker(false);
  };

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
        <div className="flex items-center gap-2 min-w-0">
          {onClose ? (
            <button onClick={() => setShowExitConfirm(true)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <button onClick={() => router.back()} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-gray-800 truncate">
              {meeting ? `Meeting Notes — ${meeting.first_name} ${meeting.last_name}` : 'Meeting Notes'}
            </h1>
            {meeting && (
              <p className="text-xs text-gray-500 truncate">
                {meeting.conference_name}
                {meeting.meeting_date && ` · ${formatMeetingDate(meeting.meeting_date)}`}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
            title="Delete all notes"
          >
            Delete
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 bg-brand-secondary text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Exit confirmation modal */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-800">Save before exiting?</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Save your notes to keep them for this meeting, or delete to remove all notes and transcripts permanently.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => { await handleSave(); onClose?.(); }}
                disabled={saving}
                className="w-full py-2 bg-brand-secondary text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save and Exit'}
              </button>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try { await fetch(`/api/meetings/${meetingId}/notes`, { method: 'DELETE' }); } catch { /* ignore */ }
                  setDeleting(false);
                  onClose?.();
                }}
                disabled={deleting}
                className="w-full py-2 border border-red-200 text-red-500 rounded-lg text-xs font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete and Exit'}
              </button>
              <button
                onClick={() => setShowExitConfirm(false)}
                className="w-full py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replace recording dialog */}
      {showReplaceRecordingDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3h-2c0 2.76-2.24 5-5 5s-5-2.24-5-5H3c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92z"/>
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-800">Replace existing recording?</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              A recording already exists for this meeting. Starting a new recording will permanently replace it.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowReplaceRecordingDialog(false)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Keep existing
              </button>
              <button
                onClick={() => {
                  setAudioBlob(null);
                  setAudioUrl(null);
                  setRecordingState('idle');
                  setShowReplaceRecordingDialog(false);
                  startRecording();
                }}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition-colors"
              >
                Replace & record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-800">Delete meeting notes?</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              All notes, transcripts, AI insights, and follow-up tasks for this meeting will be permanently deleted and cannot be recovered.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteNotes}
                disabled={deleting}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete notes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline scrubber */}
      {audioUrl && (
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={togglePlayback} className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-secondary text-white flex items-center justify-center hover:bg-blue-700 transition-colors">
              {isPlaying
                ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              }
            </button>
            <span className="text-xs text-gray-500 w-10 flex-shrink-0 font-mono">{formatTime(audioCurrentTime)}</span>
            <div
              className="relative flex-1 h-2 bg-gray-200 rounded-full cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                scrubTo(((e.clientX - rect.left) / rect.width) * audioDuration);
              }}
            >
              <div className="absolute left-0 top-0 h-2 bg-brand-secondary rounded-full" style={{ width: audioDuration > 0 ? `${(audioCurrentTime / audioDuration) * 100}%` : '0%' }} />
              {insights.filter(i => i.timestamp_seconds != null && audioDuration > 0).map(i => (
                <button
                  key={i.id}
                  className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full -ml-1 ${i.insight_type === 'buying_signal' ? 'bg-green-500' : i.insight_type === 'pain_point' ? 'bg-orange-500' : 'bg-blue-400'}`}
                  style={{ left: `${(i.timestamp_seconds! / audioDuration) * 100}%` }}
                  onClick={(e) => { e.stopPropagation(); scrubTo(i.timestamp_seconds!); }}
                  title={i.content}
                />
              ))}
            </div>
            <span className="text-xs text-gray-500 w-10 flex-shrink-0 font-mono text-right">{formatTime(audioDuration)}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="w-8 flex-shrink-0" />
            <span className="w-10 flex-shrink-0" />
            <div className="flex items-center gap-3 text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Buying signal</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> Pain point</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Action item</span>
            </div>
          </div>
          <audio ref={audioRef} src={audioUrl} className="hidden" />
        </div>
      )}
      {!audioUrl && <audio ref={audioRef} src={undefined} className="hidden" />}

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col lg:grid lg:grid-cols-[auto_1fr_1fr] h-full min-h-0">

          {/* ── Context Panel ── */}
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
              <div className="p-3 space-y-4 overflow-y-auto">

                {/* Conference */}
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
                    <IcpBadge icp={meeting.company_icp} />
                  </div>
                </div>

                {/* External Attendees */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">External Attendees</p>

                  {/* Primary attendee */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <Avatar name={`${meeting.first_name} ${meeting.last_name}`} size={7} />
                    <div>
                      <p className="text-xs font-medium text-gray-800">{meeting.first_name} {meeting.last_name}</p>
                      {meeting.title && <p className="text-[10px] text-gray-500">{meeting.title}</p>}
                    </div>
                  </div>

                  {/* Additional external attendees */}
                  {additionalAttendees.map(name => (
                    <div key={name} className="flex items-center gap-2 mb-1.5 group">
                      <Avatar name={name} size={7} />
                      <p className="text-xs font-medium text-gray-800 flex-1 min-w-0 truncate">{name}</p>
                      <button
                        onClick={() => removeExternalAttendee(name)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 hover:text-red-400 transition-all flex-shrink-0"
                        title="Remove"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  {/* Add external attendee button */}
                  {!showExternalForm && (
                    <button
                      onClick={() => setShowExternalForm(true)}
                      className="flex items-center gap-1 text-[11px] text-brand-secondary hover:text-blue-700 font-medium mt-0.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      External Attendee
                    </button>
                  )}

                  {showExternalForm && (
                    <ExternalAttendeeForm
                      conferenceId={meeting.conference_id}
                      defaultCompanyId={meeting.company_id}
                      defaultCompanyName={meeting.company_name}
                      onAdd={addExternalAttendee}
                      onCancel={() => setShowExternalForm(false)}
                    />
                  )}
                </div>

                {/* Internal Attendees */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Internal Attendees</p>

                  {/* Scheduled-by reps */}
                  {scheduledByNames.map(name => (
                    <div key={name} className="flex items-center gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-full bg-brand-primary/15 flex items-center justify-center text-[10px] font-bold text-brand-primary flex-shrink-0">
                        {name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <p className="text-xs font-medium text-gray-800 truncate">{name}</p>
                    </div>
                  ))}

                  {/* Extra internal attendees added by user */}
                  {internalAttendees.map(name => (
                    <div key={name} className="flex items-center gap-2 mb-1.5 group">
                      <div className="w-7 h-7 rounded-full bg-brand-primary/15 flex items-center justify-center text-[10px] font-bold text-brand-primary flex-shrink-0">
                        {name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <p className="text-xs font-medium text-gray-800 flex-1 truncate">{name}</p>
                      <button
                        onClick={() => setInternalAttendees(prev => prev.filter(n => n !== name))}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 hover:text-red-400 transition-all flex-shrink-0"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  {/* Add internal attendee */}
                  {!showInternalPicker && (
                    <button
                      onClick={() => setShowInternalPicker(true)}
                      className="flex items-center gap-1 text-[11px] text-brand-secondary hover:text-blue-700 font-medium mt-0.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Internal Attendee
                    </button>
                  )}

                  {showInternalPicker && (
                    <div className="mt-2 border border-gray-200 rounded-lg bg-gray-50 p-2 space-y-1">
                      {usersGrouped.internal.length > 0 && (
                        <>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1">Conference Team</p>
                          {usersGrouped.internal.map(u => (
                            <button key={u.id} onClick={() => addInternalAttendee(u.value)}
                              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-white transition-colors text-gray-700">
                              {u.value}
                            </button>
                          ))}
                        </>
                      )}
                      {usersGrouped.others.length > 0 && (
                        <>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1 pt-1">All Reps</p>
                          {usersGrouped.others.map(u => (
                            <button key={u.id} onClick={() => addInternalAttendee(u.value)}
                              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-white transition-colors text-gray-700">
                              {u.value}
                            </button>
                          ))}
                        </>
                      )}
                      <button onClick={() => setShowInternalPicker(false)} className="text-[10px] text-gray-400 hover:text-gray-600 w-full text-center pt-1">Cancel</button>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>

          {/* ── Notes + Recording column ── */}
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

              {/* Recording */}
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
                {/* Re-record button when audio exists and not currently recording */}
                {recordingState === 'idle' && audioUrl && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowReplaceRecordingDialog(true)}
                      className="text-[11px] text-gray-400 hover:text-red-500 font-medium transition-colors"
                    >
                      Re-record
                    </button>
                  </div>
                )}
                {(recordingState === 'recording' || recordingState === 'paused') && (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2">
                      {recordingState === 'recording' && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                      <span className="text-sm font-mono text-gray-700">{formatTime(recordingElapsed)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {recordingState === 'recording'
                        ? <button onClick={pauseRecording} className="px-3 py-1.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-lg hover:bg-yellow-200">Pause</button>
                        : <button onClick={resumeRecording} className="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-semibold rounded-lg hover:bg-green-200">Resume</button>
                      }
                      <button onClick={stopRecording} className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-200">Stop</button>
                    </div>
                  </div>
                )}
                {(recordingState === 'stopped' || (audioUrl && recordingState === 'idle')) && (
                  <div className="space-y-3">
                    <div className="h-10 bg-gray-100 rounded-lg flex items-center px-3 gap-0.5 overflow-hidden">
                      {Array.from({ length: 40 }).map((_, i) => (
                        <div key={i} className="flex-1 rounded-full bg-brand-secondary opacity-60"
                          style={{ height: `${20 + Math.sin(i * 0.8) * 12 + Math.cos(i * 1.2) * 8}%` }} />
                      ))}
                    </div>
                    {recordingState === 'stopped' && (
                      <div className="flex justify-end">
                        <button onClick={() => setShowReplaceRecordingDialog(true)} className="text-[11px] text-gray-400 hover:text-red-500 font-medium transition-colors">
                          Re-record
                        </button>
                      </div>
                    )}
                    {!analysisLoading && (
                      <button
                        onClick={handleAnalyze}
                        disabled={!hasAudioOrTranscript}
                        className="w-full py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
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

              {/* Upload section — audio + text side by side */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Or Upload</p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Audio upload */}
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1.5 font-medium">Audio File</p>
                    <div
                      className={`border-2 border-dashed rounded-lg p-3 text-center transition-colors cursor-pointer ${dragOver ? 'border-brand-secondary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleAudioFile(f); }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg className="w-5 h-5 text-gray-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-[10px] text-gray-500">Drag & drop or click</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">MP3, MP4, M4A, WAV, WebM</p>
                    </div>
                    <input ref={fileInputRef} type="file" accept=".mp3,.mp4,.m4a,.wav,.webm,audio/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleAudioFile(f); }} />
                  </div>

                  {/* Text transcript upload */}
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1.5 font-medium">Text Transcript</p>
                    <div
                      className={`border-2 border-dashed rounded-lg p-3 text-center transition-colors cursor-pointer ${dragOverText ? 'border-brand-secondary bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onDragOver={e => { e.preventDefault(); setDragOverText(true); }}
                      onDragLeave={() => setDragOverText(false)}
                      onDrop={e => { e.preventDefault(); setDragOverText(false); const f = e.dataTransfer.files[0]; if (f) handleTextFile(f); }}
                      onClick={() => textFileInputRef.current?.click()}
                    >
                      <svg className="w-5 h-5 text-gray-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-[10px] text-gray-500">Drag & drop or click</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">.txt, .vtt, .srt</p>
                    </div>
                    <input ref={textFileInputRef} type="file" accept=".txt,.text,.vtt,.srt" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleTextFile(f); }} />
                  </div>
                </div>
              </div>

              {/* Analyze button when no audio recorded yet but has transcript */}
              {transcript.length > 0 && !audioUrl && recordingState === 'idle' && (
                <div className="border-t border-gray-100 pt-4">
                  {!analysisLoading ? (
                    <button
                      onClick={handleAnalyze}
                      className="w-full py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      Analyze with AI
                    </button>
                  ) : (
                    <div className="flex items-center justify-center gap-2 py-2">
                      <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-gray-500">Analyzing…</span>
                    </div>
                  )}
                </div>
              )}

              {/* Transcript */}
              {transcript.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setTranscriptExpanded(e => !e)}
                      className="flex items-center gap-2 text-xs font-semibold text-gray-600"
                    >
                      <svg className={`w-4 h-4 transition-transform ${transcriptExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Transcript ({transcript.length} segments)
                    </button>
                    <button
                      onClick={() => {
                        setTranscript([]);
                        setTranscriptExpanded(false);
                        setInsights([]);
                        setSummary('');
                        setNextSteps([]);
                      }}
                      className="text-[10px] text-red-400 hover:text-red-600 font-medium transition-colors"
                      title="Clear transcript and analysis"
                    >
                      Clear
                    </button>
                  </div>
                  {transcriptExpanded && (
                    <div className="mt-2 space-y-1 max-h-60 overflow-auto">
                      {transcript.map((seg, i) => {
                        const hasBuyingSignal = insights.some(ins => ins.insight_type === 'buying_signal' && ins.timestamp_seconds != null && ins.timestamp_seconds >= seg.start && ins.timestamp_seconds <= seg.end);
                        const hasPainPoint = insights.some(ins => ins.insight_type === 'pain_point' && ins.timestamp_seconds != null && ins.timestamp_seconds >= seg.start && ins.timestamp_seconds <= seg.end);
                        return (
                          <div key={i} className={`flex gap-2 p-1.5 rounded text-xs ${hasBuyingSignal ? 'bg-green-50' : hasPainPoint ? 'bg-orange-50' : ''}`}>
                            <button onClick={() => scrubTo(seg.start)} className="flex-shrink-0 text-[10px] font-mono text-blue-500 hover:text-blue-700 underline">
                              {formatTime(seg.start)}
                            </button>
                            {seg.speaker && <span className="font-bold text-gray-600 flex-shrink-0">{seg.speaker}:</span>}
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

          {/* ── AI Analysis column ── */}
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
                  <p className="text-sm text-gray-400 max-w-[200px]">Record or upload audio, then click Analyze with AI to extract insights.</p>
                </div>
              )}

              {!analysisLoading && (insights.length > 0 || nextSteps.length > 0 || summary) && (
                <div className="space-y-5">

                  {/* Summary — always first */}
                  {summary && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Meeting Summary</h3>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 leading-relaxed">
                        {summary}
                      </div>
                    </div>
                  )}

                  {/* Next Steps */}
                  {nextSteps.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Next Steps</h3>
                      <div className="space-y-2">
                        {nextSteps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2 p-2.5 bg-white border border-gray-200 rounded-lg">
                            <input type="checkbox" checked={selectedTaskIds.has(i)}
                              onChange={e => { const n = new Set(selectedTaskIds); e.target.checked ? n.add(i) : n.delete(i); setSelectedTaskIds(n); }}
                              className="mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-700">{step.task_text}</p>
                              {step.suggested_owner && <p className="text-[10px] text-gray-400 mt-0.5">Owner: {step.suggested_owner}</p>}
                              {step.suggested_due_date_offset_days != null && <p className="text-[10px] text-gray-400">Due: +{step.suggested_due_date_offset_days} days</p>}
                            </div>
                            {step.timestamp_seconds != null && audioDuration > 0 && (
                              <button onClick={() => scrubTo(step.timestamp_seconds!)} className="text-[10px] font-mono text-blue-500 hover:underline flex-shrink-0">
                                ▶ {formatTime(step.timestamp_seconds)}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button onClick={handleConfirmTasks} disabled={selectedTaskIds.size === 0}
                        className="mt-2 w-full py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40">
                        Confirm selected tasks ({selectedTaskIds.size})
                      </button>
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
                                    ▶ {formatTime(ins.timestamp_seconds)}
                                  </button>
                                )}
                                <button onClick={() => handleConfirmInsight(ins.id)}
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold transition-colors ${ins.confirmed ? 'bg-green-200 text-green-700 hover:bg-green-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
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
                                  ▶ {formatTime(ins.timestamp_seconds)}
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

                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
