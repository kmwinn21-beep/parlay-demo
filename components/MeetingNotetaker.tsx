'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  source: 'ai' | 'manual';
}

interface ConfigOption {
  id: number;
  value: string;
  is_active: number;
  sort_order: number;
}

interface NextStepItem {
  id?: number;  // DB insight ID — present when loaded from DB or after analyze
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
  scheduled_by_names: string[];
  additional_attendees: string | null;
  meeting_date: string | null;
  meeting_time: string | null;
}

interface CompanyIntelRow {
  company_id: number;
  company_name: string;
  tier: string;
  summary: string | null;
  pain_point_signals: string[];
  trigger_events: string[];
  buying_signals: string[];
  opening_angles: string[];
  used_icp_fallback: boolean;
  generated_at: string | null;
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
  onAnalysisStateChange?: (running: boolean) => void;
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
  excludeNames?: string[];
  onAdd: (name: string) => void;
  onCancel: () => void;
}

interface AttendeeResultWithSource extends AttendeeResult {
  isConferenceAttendee: boolean;
}

function ExternalAttendeeForm({ conferenceId, defaultCompanyId, defaultCompanyName, excludeNames = [], onAdd, onCancel }: ExternalAttendeeFormProps) {
  const [tab, setTab] = useState<'search' | 'create'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AttendeeResultWithSource[]>([]);
  const [searching, setSearching] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newCompanyName, setNewCompanyName] = useState(defaultCompanyName ?? '');
  const [creating, setCreating] = useState(false);
  const [companyAttendees, setCompanyAttendees] = useState<AttendeeResult[]>([]);

  // Fetch company attendees on mount for the quick-pick list
  useEffect(() => {
    if (!defaultCompanyId) return;
    fetch(`/api/attendees?company_id=${defaultCompanyId}&limit=30`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const list: AttendeeResult[] = data?.attendees ?? data ?? [];
        setCompanyAttendees(list);
      })
      .catch(() => {});
  }, [defaultCompanyId]);

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

  const excludeSet = new Set(excludeNames.map(n => n.toLowerCase()));
  const quickPickList = companyAttendees.filter(a => !excludeSet.has(`${a.first_name} ${a.last_name}`.toLowerCase()));

  return (
    <div className="mt-2 border border-gray-200 rounded-lg bg-gray-50 p-2 space-y-1">

      {/* Company quick-pick list */}
      {quickPickList.length > 0 && (
        <>
          {defaultCompanyName && (
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1 pt-1">{defaultCompanyName}</p>
          )}
          {quickPickList.map(a => (
            <button
              key={a.id}
              onClick={() => onAdd(`${a.first_name} ${a.last_name}`)}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-white transition-colors"
            >
              <span className="text-xs text-gray-700">{a.first_name} {a.last_name}</span>
              {a.title && <span className="block text-[10px] text-gray-400 leading-tight">{a.title}</span>}
            </button>
          ))}
          <div className="border-t border-gray-200 mx-1 pt-1" />
        </>
      )}

      <div className="flex gap-1 px-1">
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

export function MeetingNotetaker({ meetingId, onClose, onRecordingStateChange, onMeetingLoaded, onAnalysisStateChange }: Props) {
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
  const recordingElapsedRef = useRef(0);
  const [recordingDuration, setRecordingDuration] = useState(0); // elapsed secs at stop, fallback when blob lacks metadata

  // Tracks last-persisted state to detect unsaved changes
  const savedStateRef = useRef({ notesText: '', audioUrl: null as string | null, hadTranscript: false });

  // UI state
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showReplaceRecordingDialog, setShowReplaceRecordingDialog] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [recordDrawer, setRecordDrawer] = useState<{ type: 'attendee' | 'company' | 'conference'; id: number } | null>(null);
  const openRecord = useCallback((type: 'attendee' | 'company' | 'conference', id: number) => setRecordDrawer({ type, id }), []);
  const closeRecord = useCallback(() => setRecordDrawer(null), []);
  const [mobileTab, setMobileTab] = useState<'context' | 'notes' | 'summary'>('notes');
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [actionItemsOpen, setActionItemsOpen] = useState(false);
  const [meetingSummaryOpen, setMeetingSummaryOpen] = useState(true);
  const [buyingSignalsOpen, setBuyingSignalsOpen] = useState(false);
  const [painPointsOpen, setPainPointsOpen] = useState(false);
  const [expandedQuotes, setExpandedQuotes] = useState<Set<number>>(new Set());

  // Drag and drop
  const [dragOver, setDragOver] = useState(false);
  const [dragOverText, setDragOverText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);

  // Upload popover
  const [uploadPopoverOpen, setUploadPopoverOpen] = useState(false);
  const uploadBtnRef = useRef<HTMLButtonElement>(null);

  // Mobile tools popover
  const [showMobileTools, setShowMobileTools] = useState(false);

  // Templates for manual capture
  const [painPointTemplates, setPainPointTemplates] = useState<string[]>([]);
  const [buyingSignalTemplates, setBuyingSignalTemplates] = useState<string[]>([]);
  const [manualInsightText, setManualInsightText] = useState<{ pain_point: string; buying_signal: string }>({ pain_point: '', buying_signal: '' });

  // Meeting intel panel
  const [showIntelPanel, setShowIntelPanel] = useState(false);
  const [companyIntel, setCompanyIntel] = useState<CompanyIntelRow | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  // "generating" is encoded in companyIntel.summary === 'Generating…' — no separate state needed

  // Expanded notes overlay
  const [showExpandedNotes, setShowExpandedNotes] = useState(false);
  const [expandedNotesText, setExpandedNotesText] = useState('');

  // Load initial data
  useEffect(() => {
    async function load() {
      try {
        const [meetingDetailRes, notesRes, usersRes, tasksRes, icpConfigRes] = await Promise.all([
          fetch(`/api/meetings/${meetingId}`),
          fetch(`/api/meetings/${meetingId}/notes`),
          fetch('/api/users'),
          fetch(`/api/meetings/${meetingId}/tasks`),
          fetch('/api/icp-config'),
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
          const loadedNotes = data.notes_text ?? '';
          const loadedAudioUrl = data.audio_file_path ?? null;
          setNotesText(loadedNotes);
          setSummary(data.summary ?? '');
          if (loadedAudioUrl) setAudioUrl(loadedAudioUrl);
          savedStateRef.current = { notesText: loadedNotes, audioUrl: loadedAudioUrl, hadTranscript: !!data.transcript };
          if (data.transcript) {
            try {
              const parsed = JSON.parse(data.transcript);
              if (Array.isArray(parsed)) setTranscript(parsed);
            } catch { /* not JSON */ }
          }
          if (data.insights?.length) setInsights(data.insights);
          // Load next_step insights as nextSteps so they persist across sessions
          const storedNextSteps = (data.insights ?? [])
            .filter((i: Insight) => i.insight_type === 'next_step')
            .map((i: Insight) => ({ id: i.id, task_text: i.content, timestamp_seconds: i.timestamp_seconds ?? undefined }));
          if (storedNextSteps.length) setNextSteps(storedNextSteps);
        }

        if (usersRes.ok) {
          const users: { id: number; value: string }[] = await usersRes.json();
          setAllUsers(users);
        }

        if (icpConfigRes.ok) {
          const icpConfig: { painPoints: string[]; triggerEvents: string[] } = await icpConfigRes.json();
          setPainPointTemplates(icpConfig.painPoints);
          setBuyingSignalTemplates(icpConfig.triggerEvents);
        }

        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          const confirmedIds = new Set<number>(
            (tasksData.tasks ?? [])
              .filter((t: { insight_id: number | null }) => t.insight_id != null)
              .map((t: { insight_id: number }) => t.insight_id)
          );
          if (confirmedIds.size > 0) setSelectedTaskIds(confirmedIds);
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
      recordingElapsedRef.current = 0;
      recordingTimerRef.current = setInterval(() => {
        recordingElapsedRef.current += 1;
        setRecordingElapsed(recordingElapsedRef.current);
      }, 1000);
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
      recordingTimerRef.current = setInterval(() => {
        recordingElapsedRef.current += 1;
        setRecordingElapsed(recordingElapsedRef.current);
      }, 1000);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecordingDuration(recordingElapsedRef.current);
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
    onAnalysisStateChange?.(true);
    try {
      let analyzeRes: Response;

      if (hasAudioBlob) {
        // Send audio directly to the analyze endpoint — no R2, no CORS required
        const ext = (audioBlob!.type.split('/')[1] || 'webm').replace('mpeg', 'mp3');
        const formData = new FormData();
        formData.append('audio_file', new File([audioBlob!], `recording.${ext}`, { type: audioBlob!.type }));
        analyzeRes = await fetch(`/api/meetings/${meetingId}/analyze`, { method: 'POST', body: formData });
      } else {
        const transcriptPayload = hasTranscript ? transcript.map(s => s.text).join('\n') : null;
        const r2Url = hasSavedAudio ? audioUrl : null;
        analyzeRes = await fetch(`/api/meetings/${meetingId}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio_url: r2Url, transcript_text: transcriptPayload }),
        });
      }

      if (!analyzeRes.ok) throw new Error((await analyzeRes.json().catch(() => ({}))).error ?? 'Analysis failed');

      const data = await analyzeRes.json();
      // Preserve manual insights — backend only deletes source='ai' rows
      setInsights(prev => [
        ...prev.filter(i => i.source === 'manual'),
        ...(data.insights ?? []),
      ]);
      setSummary(data.summary ?? '');
      if (data.transcript?.length) setTranscript(data.transcript);
      // Enrich next_steps with their DB insight IDs so delete works correctly
      const nextStepInsights = (data.insights ?? []).filter((i: Insight) => i.insight_type === 'next_step');
      const enriched = (data.next_steps ?? []).map((step: NextStepItem, idx: number) => ({
        ...step,
        id: nextStepInsights[idx]?.id,
      }));
      setNextSteps(enriched);
      toast.success('Analysis complete!');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setAnalysisLoading(false);
      onAnalysisStateChange?.(false);
    }
  }, [audioBlob, audioUrl, meetingId, transcript, onAnalysisStateChange]);

  const confirmSelectedTasksToApi = useCallback(async () => {
    const selected = nextSteps.filter(s => s.id != null && selectedTaskIds.has(s.id));
    if (!selected.length) return;
    const res = await fetch(`/api/meetings/${meetingId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: selected.map(s => ({ insight_id: s.id, task_text: s.task_text, due_date_offset_days: s.suggested_due_date_offset_days })) }),
    });
    if (!res.ok) throw new Error('Failed to confirm tasks');
    window.dispatchEvent(new CustomEvent('meeting-tasks-confirmed', { detail: { meetingId } }));
  }, [meetingId, nextSteps, selectedTaskIds]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // If there's an in-memory blob with no persisted URL, upload to R2 via server-side route
      let persistedAudioUrl = audioUrl && !audioUrl.startsWith('blob:') ? audioUrl : null;
      if (audioBlob && !persistedAudioUrl) {
        try {
          const ext = (audioBlob.type.split('/')[1] || 'webm').replace('mpeg', 'mp3');
          const fd = new FormData();
          fd.append('file', new File([audioBlob], `recording.${ext}`, { type: audioBlob.type }));
          const up = await fetch(`/api/meetings/${meetingId}/audio`, { method: 'POST', body: fd });
          if (up.ok) {
            const { url } = await up.json();
            persistedAudioUrl = url;
            setAudioUrl(url);
            setAudioBlob(null);
          }
        } catch { /* non-blocking — save proceeds without audio_file_path */ }
      }

      const res = await fetch(`/api/meetings/${meetingId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes_text: notesText,
          transcript: transcript.length ? JSON.stringify(transcript) : null,
          summary,
          audio_file_path: persistedAudioUrl,
        }),
      });
      if (!res.ok) throw new Error();
      savedStateRef.current = { notesText, audioUrl: persistedAudioUrl, hadTranscript: transcript.length > 0 };
      // Confirm any selected action items into the bundled follow-up
      if (selectedTaskIds.size > 0) {
        try { await confirmSelectedTasksToApi(); } catch { /* non-blocking */ }
      }
      toast.success('Notes saved.');
      // Set outcome to Held (best-effort, non-blocking)
      if (meeting) {
        fetch(`/api/meetings/${meetingId}/set-held`, { method: 'POST' }).catch(() => {});
      }
      // Sync meeting note cards to entity feeds if AI analysis exists
      if (meeting && summary) {
        const actionItems = insights.filter(i => i.insight_type === 'next_step');
        const buyingSig = insights.filter(i => i.insight_type === 'buying_signal');
        const painPts = insights.filter(i => i.insight_type === 'pain_point');
        fetch(`/api/meetings/${meetingId}/notes/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary,
            attendee_id: meeting.attendee_id,
            company_id: meeting.company_id,
            conference_id: meeting.conference_id,
            conference_name: meeting.conference_name,
            attendee_name: `${meeting.first_name} ${meeting.last_name}`,
            company_name: meeting.company_name,
            insight_counts: JSON.stringify({
              buying_signals: buyingSig.length,
              pain_points: painPts.length,
              action_items: actionItems.length,
            }),
          }),
        }).catch(() => {});
      }
    } catch {
      toast.error('Failed to save notes.');
    } finally {
      setSaving(false);
    }
  }, [meetingId, notesText, transcript, summary, audioUrl, audioBlob, meeting, insights, selectedTaskIds, confirmSelectedTasksToApi]);

  // Exact strings written by fallbackResult() in generateCompanyIntel.ts
  const INTEL_FALLBACK_STRINGS = [
    'Insufficient data to identify specific signals.',
    'No specific trigger events identified.',
    'No specific buying signals identified.',
    'Ask about their current challenges in their industry.',
  ];

  // Mirror TargetIntelTab: poll via useEffect when summary === 'Generating…', stop when real data arrives.
  const isCompanyIntelGenerating = companyIntel?.summary === 'Generating…';
  useEffect(() => {
    if (!isCompanyIntelGenerating || !meeting?.conference_id || !meeting?.company_id) return;
    const conferenceId = meeting.conference_id;
    const companyId = meeting.company_id;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 40) { clearInterval(interval); setCompanyIntel(null); return; }
      const res = await fetch(`/api/conferences/${conferenceId}/intel`).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json() as { intel: CompanyIntelRow[] };
      const row = data.intel.find(r => Number(r.company_id) === Number(companyId));
      if (row && row.summary !== 'Generating…' && row.summary !== null) {
        setCompanyIntel(row);
        window.dispatchEvent(new CustomEvent('parlay:intel-updated', { detail: { conference_id: conferenceId } }));
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isCompanyIntelGenerating, meeting?.conference_id, meeting?.company_id]);

  const handleGetMeetingIntel = useCallback(async () => {
    if (!meeting?.company_id || !meeting?.conference_id) {
      toast.error('No company associated with this meeting.');
      return;
    }

    setShowIntelPanel(true);
    setIntelLoading(true);
    try {
      const intelRes = await fetch(`/api/conferences/${meeting.conference_id}/intel`);
      if (intelRes.ok) {
        const data = await intelRes.json() as { intel: CompanyIntelRow[] };
        const existing = data.intel.find(r => Number(r.company_id) === Number(meeting.company_id));
        if (existing && existing.summary !== 'Generating…' && existing.summary !== null) {
          const allText = [...existing.pain_point_signals, ...existing.trigger_events, ...existing.buying_signals, ...existing.opening_angles];
          const isFallback = INTEL_FALLBACK_STRINGS.every(f => allText.includes(f));
          if (!isFallback) {
            // Real intel — show it
            setCompanyIntel(existing);
            setIntelLoading(false);
            return;
          }
          // Fallback placeholders — show stub and trigger fresh generation
        }
        if (existing) {
          // Already generating or fallback — set what we have and let the useEffect poll
          setCompanyIntel({ ...existing, summary: 'Generating…' });
          setIntelLoading(false);
          if (existing.summary !== 'Generating…') {
            // Fallback case: need to trigger a new generation
            await fetch(`/api/conferences/${meeting.conference_id}/intel/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ company_id: meeting.company_id }),
            });
          }
          return;
        }
      }
      // No intel yet — set stub and trigger generation; useEffect will poll
      setCompanyIntel({
        company_id: meeting.company_id,
        company_name: meeting.company_name ?? '',
        tier: 'Unknown',
        summary: 'Generating…',
        pain_point_signals: [],
        trigger_events: [],
        buying_signals: [],
        opening_angles: [],
        used_icp_fallback: false,
        generated_at: null,
      });
      setIntelLoading(false);
      await fetch(`/api/conferences/${meeting.conference_id}/intel/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: meeting.company_id }),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to get meeting intel');
      setIntelLoading(false);
      setCompanyIntel(null);
    }
  }, [meeting]);

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

  const handleDeleteInsight = useCallback(async (insightId: number) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/insights/${insightId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setInsights(prev => prev.filter(i => i.id !== insightId));
      setNextSteps(prev => prev.filter(s => s.id !== insightId));
      setSelectedTaskIds(prev => { const n = new Set(prev); n.delete(insightId); return n; });
    } catch {
      toast.error('Failed to delete item.');
    }
  }, [meetingId]);

  const handleConfirmTasks = useCallback(async () => {
    if (!selectedTaskIds.size) { toast.error('Select at least one task.'); return; }
    try {
      await confirmSelectedTasksToApi();
      toast.success('Tasks created as follow-ups!');
    } catch {
      toast.error('Failed to create tasks.');
    }
  }, [selectedTaskIds.size, confirmSelectedTasksToApi]);

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
      savedStateRef.current = { notesText: '', audioUrl: null, hadTranscript: false };
      window.dispatchEvent(new CustomEvent('meeting-notes-deleted', { detail: { meetingId } }));
      onClose?.();
    } catch {
      toast.error('Failed to delete notes.');
    } finally {
      setDeleting(false);
    }
  }, [meetingId, onClose]);

  const handleAddManualInsight = useCallback(async (insight_type: 'pain_point' | 'buying_signal', content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    // Optimistic insert
    const tempId = -(Date.now());
    const optimistic: Insight = { id: tempId, insight_type, content: trimmed, quote: null, timestamp_seconds: null, confidence: 'high', confirmed: true, source: 'manual' };
    setInsights(prev => [...prev, optimistic]);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insight_type, content: trimmed, source: 'manual' }),
      });
      if (!res.ok) throw new Error();
      const created: Insight = await res.json();
      setInsights(prev => prev.map(i => i.id === tempId ? created : i));
    } catch {
      setInsights(prev => prev.filter(i => i.id !== tempId));
      toast.error('Failed to save insight.');
    }
  }, [meetingId]);

  const sortConfirmedFirst = (a: Insight, b: Insight) => (b.confirmed ? 1 : 0) - (a.confirmed ? 1 : 0);
  // Manual entries first, then AI; within each group confirmed first
  const sortManualFirst = (a: Insight, b: Insight) => {
    if (a.source !== b.source) return a.source === 'manual' ? -1 : 1;
    return (b.confirmed ? 1 : 0) - (a.confirmed ? 1 : 0);
  };
  const buyingSignals = insights.filter(i => i.insight_type === 'buying_signal').sort(sortManualFirst);
  const painPoints = insights.filter(i => i.insight_type === 'pain_point').sort(sortManualFirst);
  const hasAudioOrTranscript = !!(audioUrl || audioBlob || transcript.length);

  // Use recorded elapsed time as fallback when the webm blob lacks duration metadata (Infinity)
  const displayDuration = isFinite(audioDuration) && audioDuration > 0 ? audioDuration : recordingDuration;

  // True when user has changes that haven't been persisted yet
  const hasUnsavedChanges = (
    notesText !== savedStateRef.current.notesText ||
    !!audioBlob ||
    !!(audioUrl?.startsWith('blob:')) ||
    internalAttendees.length > 0 ||
    (!savedStateRef.current.hadTranscript && transcript.length > 0)
  );

  // scheduled_by_names is pre-resolved by the API (config_option IDs → display names)
  const scheduledByNames: string[] = meeting?.scheduled_by_names ?? [];

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
        <div className="w-6 h-6 border-2 border-brand-highlight border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => { if (hasUnsavedChanges) setShowExitConfirm(true); else onClose?.(); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
        {/* Mobile tools icon — opens a popover with Record / Upload / AI Summary */}
        <div className="lg:hidden relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowMobileTools(v => !v)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            title="Recording & AI tools"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
          {showMobileTools && (
            <>
              <div className="fixed inset-0 z-[30]" onClick={() => setShowMobileTools(false)} />
              <div className="absolute right-0 top-full mt-1 z-[31] bg-white border border-gray-200 rounded-xl shadow-xl py-2 min-w-[220px]">
                {/* Record */}
                <button
                  onClick={() => {
                    setShowMobileTools(false);
                    if (recordingState !== 'idle') return;
                    if (audioUrl) setShowReplaceRecordingDialog(true);
                    else startRecording();
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${
                    recordingState === 'recording' ? 'text-red-600 bg-red-50' :
                    recordingState === 'paused' ? 'text-yellow-700 bg-yellow-50' :
                    'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                  <span className="font-medium">
                    {recordingState === 'recording' ? `Recording — ${formatTime(recordingElapsed)}` : recordingState === 'paused' ? 'Paused' : 'Record Audio'}
                  </span>
                </button>

                {/* Pause / Resume / Stop when recording */}
                {(recordingState === 'recording' || recordingState === 'paused') && (
                  <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-50">
                    {recordingState === 'recording' ? (
                      <button onClick={() => { pauseRecording(); setShowMobileTools(false); }} className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-yellow-100 text-yellow-700">Pause</button>
                    ) : (
                      <button onClick={() => { resumeRecording(); setShowMobileTools(false); }} className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-green-100 text-green-700">Resume</button>
                    )}
                    <button onClick={() => { stopRecording(); setShowMobileTools(false); }} className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-red-100 text-red-700">Stop</button>
                  </div>
                )}

                {/* Upload Audio */}
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowMobileTools(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3 border-t border-gray-50"
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <div>
                    <span className="font-medium block">Upload Audio</span>
                    <span className="text-[10px] text-gray-400">MP3, MP4, M4A, WAV, WebM</span>
                  </div>
                </button>

                {/* Upload Transcript */}
                <button
                  onClick={() => { textFileInputRef.current?.click(); setShowMobileTools(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <span className="font-medium block">Upload Transcript</span>
                    <span className="text-[10px] text-gray-400">.txt, .vtt, .srt</span>
                  </div>
                </button>

                {/* Get Meeting Intel */}
                {meeting?.company_id && (
                  <button
                    onClick={() => { setShowMobileTools(false); handleGetMeetingIntel(); }}
                    disabled={intelLoading || isCompanyIntelGenerating}
                    className="w-full text-left px-4 py-2.5 text-sm text-amber-700 hover:bg-amber-50 transition-colors flex items-center gap-3 border-t border-gray-100 disabled:opacity-40"
                  >
                    {isCompanyIntelGenerating ? (
                      <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                    <span className="font-medium">{isCompanyIntelGenerating ? 'Generating…' : 'Get Meeting Intel'}</span>
                  </button>
                )}

                {/* Generate AI Summary */}
                <button
                  onClick={() => { handleAnalyze(); setShowMobileTools(false); }}
                  disabled={analysisLoading || !hasAudioOrTranscript}
                  className="w-full text-left px-4 py-2.5 text-sm text-teal-700 hover:bg-teal-50 transition-colors flex items-center gap-3 border-t border-gray-100 disabled:opacity-40"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <span className="font-medium">{analysisLoading ? 'Analyzing…' : 'Generate AI Summary'}</span>
                </button>
              </div>
            </>
          )}
        </div>

        <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
          {/* Record button */}
          <button
            onClick={() => {
              if (recordingState !== 'idle') return;
              if (audioUrl) setShowReplaceRecordingDialog(true);
              else startRecording();
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
              recordingState === 'recording' ? 'border-red-400 bg-red-50 text-red-600' :
              recordingState === 'paused' ? 'border-yellow-400 bg-yellow-50 text-yellow-700' :
              'border-red-300 bg-red-50 text-red-600 hover:bg-red-100'
            }`}
            title={recordingState === 'recording' ? `Recording — ${formatTime(recordingElapsed)}` : 'Record audio'}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            {recordingState === 'recording' ? formatTime(recordingElapsed) : recordingState === 'paused' ? 'Paused' : 'Record'}
          </button>

          {/* Recording controls when active */}
          {(recordingState === 'recording' || recordingState === 'paused') && (
            <div className="flex items-center gap-1">
              {recordingState === 'recording'
                ? <button onClick={pauseRecording} className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors">Pause</button>
                : <button onClick={resumeRecording} className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors">Resume</button>
              }
              <button onClick={stopRecording} className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors">Stop</button>
            </div>
          )}

          {/* Upload button with popover */}
          <div className="relative">
            <button
              ref={uploadBtnRef}
              onClick={() => setUploadPopoverOpen(o => !o)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload
            </button>
            {uploadPopoverOpen && (
              <>
                <div className="fixed inset-0 z-[30]" onClick={() => setUploadPopoverOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-[31] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px]">
                  <button
                    onClick={() => { fileInputRef.current?.click(); setUploadPopoverOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium">Audio file</span>
                    <span className="block text-gray-400 text-[10px] mt-0.5">MP3, MP4, M4A, WAV, WebM</span>
                  </button>
                  <button
                    onClick={() => { textFileInputRef.current?.click(); setUploadPopoverOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-medium">Text transcript</span>
                    <span className="block text-gray-400 text-[10px] mt-0.5">.txt, .vtt, .srt</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Get Meeting Intel */}
          {meeting?.company_id && (
            <button
              onClick={handleGetMeetingIntel}
              disabled={intelLoading || isCompanyIntelGenerating}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
                showIntelPanel
                  ? 'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
              } disabled:opacity-50`}
              title="Get company intel for this meeting"
            >
              {isCompanyIntelGenerating ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              {isCompanyIntelGenerating ? 'Generating…' : 'Get Meeting Intel'}
            </button>
          )}

          {/* Generate AI Summary */}
          <button
            onClick={handleAnalyze}
            disabled={analysisLoading || (!hasAudioOrTranscript)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 transition-colors flex items-center gap-1.5 disabled:opacity-40"
            title="Generate AI summary from audio or transcript"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            {analysisLoading ? 'Analyzing…' : 'Generate AI Summary'}
          </button>

          <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />

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

      {/* Mobile action row — Delete + Save between header and tab bar */}
      <div className="lg:hidden flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0">
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
        >
          Delete
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-1.5 bg-brand-secondary text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Mobile tab bar */}
      <div className="lg:hidden flex border-b border-gray-200 bg-white flex-shrink-0">
        {(['context', 'notes', 'summary'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors ${
              mobileTab === tab
                ? 'text-brand-primary border-b-2 border-brand-primary'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab === 'summary' ? 'Summary' : tab === 'notes' ? 'Notes' : 'Context'}
          </button>
        ))}
      </div>

      {/* Exit confirmation modal — only shown when there are unsaved changes */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-gray-800">You have unsaved changes</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Save to keep your latest changes, or discard them and exit without affecting previously saved data.
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
                onClick={() => { setShowExitConfirm(false); onClose?.(); }}
                className="w-full py-2 border border-red-200 text-red-500 rounded-lg text-xs font-semibold hover:bg-red-50 transition-colors"
              >
                Discard Changes &amp; Exit
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
                scrubTo(((e.clientX - rect.left) / rect.width) * displayDuration);
              }}
            >
              <div className="absolute left-0 top-0 h-2 bg-brand-secondary rounded-full" style={{ width: displayDuration > 0 ? `${(audioCurrentTime / displayDuration) * 100}%` : '0%' }} />
              {insights.filter(i => i.timestamp_seconds != null && displayDuration > 0).map(i => (
                <button
                  key={i.id}
                  className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full -ml-1 ${i.insight_type === 'buying_signal' ? 'bg-green-500' : i.insight_type === 'pain_point' ? 'bg-orange-500' : 'bg-blue-400'}`}
                  style={{ left: `${(i.timestamp_seconds! / displayDuration) * 100}%` }}
                  onClick={(e) => { e.stopPropagation(); scrubTo(i.timestamp_seconds!); }}
                  title={i.content}
                />
              ))}
            </div>
            <span className="text-xs text-gray-500 w-10 flex-shrink-0 font-mono text-right">{formatTime(displayDuration)}</span>
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
        <div className="flex flex-col lg:flex lg:flex-row h-full min-h-0 relative">

          {/* ── Context Panel ── */}
          <div className={`border-b lg:border-b-0 lg:border-r border-gray-200 transition-all duration-200 ${contextCollapsed ? 'lg:w-8' : 'lg:w-64'} flex-shrink-0 ${mobileTab !== 'context' ? 'hidden lg:flex lg:flex-col' : ''}`}>
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
                  <button
                    type="button"
                    onClick={() => openRecord('conference', meeting.conference_id)}
                    className="inline-flex items-center px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors"
                  >
                    {meeting.conference_name}
                  </button>
                </div>

                {/* Company */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Company</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {meeting.company_id ? (
                      <button
                        type="button"
                        onClick={() => openRecord('company', meeting.company_id!)}
                        className="text-xs font-medium text-gray-800 hover:text-brand-secondary transition-colors text-left"
                      >
                        {meeting.company_name}
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-gray-800">{meeting.company_name ?? '—'}</span>
                    )}
                    <IcpBadge icp={meeting.company_icp} />
                  </div>
                </div>

                {/* External Attendees */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">External Attendees</p>

                  {/* Primary attendee */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <Avatar name={`${meeting.first_name} ${meeting.last_name}`} size={7} />
                    <button
                      type="button"
                      onClick={() => openRecord('attendee', meeting.attendee_id)}
                      className="text-left hover:text-brand-secondary transition-colors"
                    >
                      <p className="text-xs font-medium text-gray-800">{meeting.first_name} {meeting.last_name}</p>
                      {meeting.title && <p className="text-[10px] text-gray-500">{meeting.title}</p>}
                    </button>
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
                      excludeNames={[`${meeting.first_name} ${meeting.last_name}`, ...additionalAttendees]}
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
          <div className={`border-b lg:border-b-0 lg:border-r border-gray-200 overflow-auto lg:w-[320px] lg:flex-shrink-0 ${mobileTab !== 'notes' ? 'hidden lg:block' : ''}`}>
            <div className="p-4 space-y-4">

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-600">Notes</label>
                  <button
                    type="button"
                    onClick={() => { setExpandedNotesText(notesText); setShowExpandedNotes(true); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Expand notes"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </button>
                </div>
                <textarea
                  value={notesText}
                  onChange={e => setNotesText(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-secondary resize-none"
                  rows={6}
                  placeholder="Free-form meeting notes…"
                />
              </div>

              {/* Hidden file inputs — kept in DOM for Upload button in header */}
              <input ref={fileInputRef} type="file" accept=".mp3,.mp4,.m4a,.wav,.webm,audio/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAudioFile(f); }} />
              <input ref={textFileInputRef} type="file" accept=".txt,.text,.vtt,.srt" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleTextFile(f); }} />

              {/* ── Pain Points ── */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="#E24B4A" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <span className="text-[11px] font-medium text-gray-600">Pain points</span>
                </div>

                {/* Free-text input */}
                <input
                  type="text"
                  value={manualInsightText.pain_point}
                  onChange={e => setManualInsightText(prev => ({ ...prev, pain_point: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddManualInsight('pain_point', manualInsightText.pain_point);
                      setManualInsightText(prev => ({ ...prev, pain_point: '' }));
                    }
                  }}
                  placeholder="Type a pain point and press Enter…"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-300 placeholder-gray-300 mb-2"
                />

                {/* Quick-tap templates */}
                {painPointTemplates.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {painPointTemplates.map(t => {
                      const alreadyAdded = insights.some(i => i.source === 'manual' && i.insight_type === 'pain_point' && i.content === t);
                      return (
                        <button
                          key={t}
                          disabled={alreadyAdded}
                          onClick={() => handleAddManualInsight('pain_point', t)}
                          style={{ background: '#FAECE7', border: '0.5px solid #F5C4B3', color: '#993C1D', opacity: alreadyAdded ? 0.4 : 1 }}
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium transition-opacity"
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Manual chips */}
                {insights.filter(i => i.source === 'manual' && i.insight_type === 'pain_point').length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {insights.filter(i => i.source === 'manual' && i.insight_type === 'pain_point').map(ins => (
                      <span
                        key={ins.id}
                        style={{ background: '#FAECE7', border: '0.5px solid #F5C4B3', color: '#993C1D' }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                      >
                        {ins.content}
                        <button
                          onClick={() => handleDeleteInsight(ins.id)}
                          className="hover:opacity-70 transition-opacity leading-none"
                        >×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Trigger Events & Buying Signals ── */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="#1D9E75" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <span className="text-[11px] font-medium text-gray-600">Trigger Events & Buying Signals</span>
                </div>

                {/* Free-text input */}
                <input
                  type="text"
                  value={manualInsightText.buying_signal}
                  onChange={e => setManualInsightText(prev => ({ ...prev, buying_signal: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddManualInsight('buying_signal', manualInsightText.buying_signal);
                      setManualInsightText(prev => ({ ...prev, buying_signal: '' }));
                    }
                  }}
                  placeholder="Type a buying signal and press Enter…"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-300 placeholder-gray-300 mb-2"
                />

                {/* Quick-tap templates */}
                {buyingSignalTemplates.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {buyingSignalTemplates.map(t => {
                      const alreadyAdded = insights.some(i => i.source === 'manual' && i.insight_type === 'buying_signal' && i.content === t);
                      return (
                        <button
                          key={t}
                          disabled={alreadyAdded}
                          onClick={() => handleAddManualInsight('buying_signal', t)}
                          style={{ background: '#E1F5EE', border: '0.5px solid #9FE1CB', color: '#0F6E56', opacity: alreadyAdded ? 0.4 : 1 }}
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium transition-opacity"
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Manual chips */}
                {insights.filter(i => i.source === 'manual' && i.insight_type === 'buying_signal').length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {insights.filter(i => i.source === 'manual' && i.insight_type === 'buying_signal').map(ins => (
                      <span
                        key={ins.id}
                        style={{ background: '#E1F5EE', border: '0.5px solid #9FE1CB', color: '#0F6E56' }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                      >
                        {ins.content}
                        <button
                          onClick={() => handleDeleteInsight(ins.id)}
                          className="hover:opacity-70 transition-opacity leading-none"
                        >×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
          <div className={`overflow-auto flex-1 min-w-0 ${mobileTab !== 'summary' ? 'hidden lg:block' : ''}`}>
            <div className="p-4">
              {analysisLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">Analyzing with AI…</p>
                </div>
              )}

              {!analysisLoading && insights.length === 0 && nextSteps.length === 0 && !summary && !notesText && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <p className="text-sm text-gray-400 max-w-[200px]">Add pain points or buying signals on the left, or record / upload audio to generate an AI summary.</p>
                </div>
              )}

              {!analysisLoading && (insights.length > 0 || nextSteps.length > 0 || summary || notesText || buyingSignals.length > 0 || painPoints.length > 0) && (
                <div className="space-y-5">

                  {/* 1. Meeting Summary */}
                  {summary && (
                    <div>
                      <button
                        onClick={() => setMeetingSummaryOpen(o => !o)}
                        className="w-full flex items-center justify-between text-left py-1 group"
                      >
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Meeting Summary</h3>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${meetingSummaryOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {meetingSummaryOpen && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 leading-relaxed mt-2">
                          {summary}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. User Notes */}
                  {notesText && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">User Notes</h3>
                      <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {notesText}
                      </div>
                    </div>
                  )}

                  {/* 3. Action Items (collapsible, default collapsed) */}
                  {(nextSteps.length > 0) && (
                    <div>
                      <button
                        onClick={() => setActionItemsOpen(o => !o)}
                        className="w-full flex items-center justify-between text-left py-1 group"
                      >
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          Action Items ({nextSteps.length})
                        </h3>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${actionItemsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {actionItemsOpen && (
                        <div className="space-y-2 mt-2">
                          {[...nextSteps].sort((a, b) => {
                            const aSelected = a.id != null && selectedTaskIds.has(a.id) ? 1 : 0;
                            const bSelected = b.id != null && selectedTaskIds.has(b.id) ? 1 : 0;
                            return bSelected - aSelected;
                          }).map((step) => {
                            const isSelected = step.id != null && selectedTaskIds.has(step.id);
                            return (
                            <div key={step.id ?? step.task_text} className={`flex items-start gap-2 p-2.5 rounded-lg border-2 transition-colors ${isSelected ? 'border-brand-primary bg-brand-primary/8' : 'border-gray-200 bg-white'}`}>
                              <input type="checkbox"
                                checked={step.id != null && selectedTaskIds.has(step.id)}
                                onChange={e => {
                                  if (step.id == null) return;
                                  const n = new Set(selectedTaskIds);
                                  if (e.target.checked) n.add(step.id); else n.delete(step.id);
                                  setSelectedTaskIds(n);
                                }}
                                className="mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-700">{step.task_text}</p>
                                {step.suggested_owner && <p className="text-[10px] text-gray-400 mt-0.5">Owner: {step.suggested_owner}</p>}
                                {step.suggested_due_date_offset_days != null && <p className="text-[10px] text-gray-400">Due: +{step.suggested_due_date_offset_days} days</p>}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {step.timestamp_seconds != null && displayDuration > 0 && (
                                  <button onClick={() => scrubTo(step.timestamp_seconds!)} className="text-[10px] font-mono text-blue-500 hover:underline">
                                    ▶ {formatTime(step.timestamp_seconds)}
                                  </button>
                                )}
                                {step.id != null && (
                                  <button onClick={() => handleDeleteInsight(step.id!)} title="Delete" className="p-0.5 rounded text-gray-300 hover:text-red-400 transition-colors">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                            );
                          })}
                          <button onClick={handleConfirmTasks} disabled={selectedTaskIds.size === 0}
                            className="mt-1 w-full py-1.5 bg-brand-primary text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-colors disabled:opacity-40">
                            Confirm selected tasks ({selectedTaskIds.size})
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4. Buying Signals */}
                  {buyingSignals.length > 0 && (
                    <div>
                      <button
                        onClick={() => setBuyingSignalsOpen(o => !o)}
                        className="w-full flex items-center justify-between text-left py-1"
                      >
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          Buying Signals ({buyingSignals.length})
                        </h3>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${buyingSignalsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {buyingSignalsOpen && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {buyingSignals.map(ins => (
                            <div key={ins.id} className={`p-2.5 rounded-lg border text-xs flex flex-col ${ins.confirmed ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
                              <div className="flex items-start justify-between gap-1 mb-1.5">
                                <span className="font-semibold text-gray-800 flex-1 leading-tight">{ins.content}</span>
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  {ins.timestamp_seconds != null && displayDuration > 0 && (
                                    <button onClick={() => scrubTo(ins.timestamp_seconds!)} className="text-[10px] font-mono text-blue-500 hover:underline">
                                      ▶{formatTime(ins.timestamp_seconds)}
                                    </button>
                                  )}
                                  <button onClick={() => handleDeleteInsight(ins.id)} title="Delete" className="p-0.5 rounded text-gray-300 hover:text-red-400 transition-colors">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                              {/* Source label */}
                              <p className="text-[10px] text-gray-400 mb-1">
                                {ins.source === 'manual' ? 'Added manually' : (
                                  <span className="inline-flex items-center gap-0.5">
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                    AI extracted
                                  </span>
                                )}
                              </p>
                              {ins.quote && (
                                <div className="mb-2">
                                  {expandedQuotes.has(ins.id) && (
                                    <blockquote className="text-[10px] text-gray-500 italic border-l-2 border-gray-200 pl-2 mb-0.5">
                                      &ldquo;{ins.quote}&rdquo;
                                    </blockquote>
                                  )}
                                  <button
                                    onClick={() => setExpandedQuotes(prev => { const n = new Set(prev); if (n.has(ins.id)) n.delete(ins.id); else n.add(ins.id); return n; })}
                                    className="text-[10px] text-blue-500 hover:underline"
                                  >
                                    {expandedQuotes.has(ins.id) ? 'Hide Quote' : 'Show Quote'}
                                  </button>
                                </div>
                              )}
                              <div className="flex items-center justify-between mt-auto pt-1">
                                <span className="text-[10px] text-gray-400">{ins.confidence}</span>
                                <button
                                  onClick={() => handleConfirmInsight(ins.id)}
                                  title={ins.confirmed ? 'Unmark priority' : 'Mark as priority'}
                                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                    ins.confirmed
                                      ? 'bg-green-500 border-green-500 text-white'
                                      : 'bg-white border-green-400 text-green-400 hover:border-green-500'
                                  }`}
                                >
                                  <svg className="w-3.5 h-3.5" fill={ins.confirmed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 5. Pain Points */}
                  {painPoints.length > 0 && (
                    <div>
                      <button
                        onClick={() => setPainPointsOpen(o => !o)}
                        className="w-full flex items-center justify-between text-left py-1"
                      >
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                          Pain Points ({painPoints.length})
                        </h3>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${painPointsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {painPointsOpen && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {painPoints.map(ins => (
                            <div key={ins.id} className={`p-2.5 rounded-lg border text-xs flex flex-col ${ins.confirmed ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
                              <div className="flex items-start justify-between gap-1 mb-1.5">
                                <span className="font-semibold text-gray-800 flex-1 leading-tight">{ins.content}</span>
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  {ins.timestamp_seconds != null && displayDuration > 0 && (
                                    <button onClick={() => scrubTo(ins.timestamp_seconds!)} className="text-[10px] font-mono text-blue-500 hover:underline">
                                      ▶{formatTime(ins.timestamp_seconds)}
                                    </button>
                                  )}
                                  <button onClick={() => handleDeleteInsight(ins.id)} title="Delete" className="p-0.5 rounded text-gray-300 hover:text-red-400 transition-colors">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                              {/* Source label */}
                              <p className="text-[10px] text-gray-400 mb-1">
                                {ins.source === 'manual' ? 'Added manually' : (
                                  <span className="inline-flex items-center gap-0.5">
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                    </svg>
                                    AI extracted
                                  </span>
                                )}
                              </p>
                              {ins.quote && (
                                <div className="mb-2">
                                  {expandedQuotes.has(ins.id) && (
                                    <blockquote className="text-[10px] text-gray-500 italic border-l-2 border-orange-200 pl-2 mb-0.5">
                                      &ldquo;{ins.quote}&rdquo;
                                    </blockquote>
                                  )}
                                  <button
                                    onClick={() => setExpandedQuotes(prev => { const n = new Set(prev); if (n.has(ins.id)) n.delete(ins.id); else n.add(ins.id); return n; })}
                                    className="text-[10px] text-blue-500 hover:underline"
                                  >
                                    {expandedQuotes.has(ins.id) ? 'Hide Quote' : 'Show Quote'}
                                  </button>
                                </div>
                              )}
                              <div className="flex items-center justify-between mt-auto pt-1">
                                <span className="text-[10px] text-gray-400">{ins.confidence}</span>
                                <button
                                  onClick={() => handleConfirmInsight(ins.id)}
                                  title={ins.confirmed ? 'Unmark priority' : 'Mark as priority'}
                                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                    ins.confirmed
                                      ? 'bg-green-500 border-green-500 text-white'
                                      : 'bg-white border-green-400 text-green-400 hover:border-green-500'
                                  }`}
                                >
                                  <svg className="w-3.5 h-3.5" fill={ins.confirmed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 6. Transcript */}
                  {transcript.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between py-1">
                        <button
                          onClick={() => setTranscriptExpanded(e => !e)}
                          className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide"
                        >
                          <svg className={`w-4 h-4 text-gray-400 transition-transform ${transcriptExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
              )}
            </div>
          </div>

          {/* ── Expanded Notes Overlay — covers the summary (3rd) column ── */}
          {showExpandedNotes && (
            <div className="absolute inset-y-0 right-0 z-[20] flex flex-col bg-white border-l border-gray-200 shadow-xl lg:w-[calc(100%-320px-256px)] w-full">
              <style>{`@keyframes fadeInExpand { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }`}</style>
              <div className="flex flex-col h-full" style={{ animation: 'fadeInExpand 150ms ease-out' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
                  <span className="text-sm font-semibold text-gray-800">Notes</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setNotesText(expandedNotesText);
                        setShowExpandedNotes(false);
                        toast.success('Notes saved.');
                      }}
                      className="px-3 py-1.5 bg-brand-secondary text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setNotesText(expandedNotesText);
                        setShowExpandedNotes(false);
                        toast.success('Notes saved.');
                      }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                      title="Close"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Large textarea */}
                <div className="flex-1 p-5 overflow-hidden">
                  <textarea
                    autoFocus
                    value={expandedNotesText}
                    onChange={e => setExpandedNotesText(e.target.value)}
                    placeholder="Free-form meeting notes…"
                    className="w-full h-full border border-gray-200 rounded-xl p-4 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-secondary resize-none leading-relaxed"
                  />
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Meeting Intel Drawer — slides in from right ── */}
      {showIntelPanel && (
        <div className="fixed inset-0 z-[65] flex justify-end pointer-events-none">
          <style>{`@keyframes slideInFromRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
          <div
            className="h-full w-full sm:max-w-[400px] bg-white flex flex-col overflow-hidden shadow-2xl pointer-events-auto"
            style={{ animation: 'slideInFromRight 200ms ease-out' }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Company Intel</h3>
                  {meeting?.company_name && (
                    <p className="text-xs text-gray-500">{meeting.company_name}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!intelLoading && !isCompanyIntelGenerating && companyIntel !== null && companyIntel.summary !== null && companyIntel.summary !== 'Generating…' && (
                  <button
                    onClick={() => {
                      setCompanyIntel(null);
                      handleGetMeetingIntel();
                    }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-amber-600 transition-colors"
                    title="Refresh intel"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => setShowIntelPanel(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Drawer body */}
            <div className="overflow-y-auto flex-1 px-5 py-5">
              {(intelLoading || isCompanyIntelGenerating) && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  {isCompanyIntelGenerating
                    ? <><p className="text-sm text-gray-500">Researching {meeting?.company_name}…</p><p className="text-xs text-gray-400 mt-1">This takes 15–30 seconds</p></>
                    : <p className="text-sm text-gray-500">Loading intel…</p>
                  }
                </div>
              )}

              {companyIntel !== null && companyIntel.summary !== null && companyIntel.summary !== undefined && companyIntel.summary !== 'Generating…' && (
                <div className="space-y-5">
                  {/* Tier + date */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5">{companyIntel.tier}</span>
                    {companyIntel.generated_at && (
                      <span className="text-xs text-gray-400">
                        Updated {new Date(companyIntel.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {companyIntel.used_icp_fallback && (
                      <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">ICP fallback</span>
                    )}
                  </div>

                  {/* Overview */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Overview</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{companyIntel.summary}</p>
                  </div>

                  {/* Pain point signals */}
                  {companyIntel.pain_point_signals.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Pain Point Signals</p>
                      <ul className="space-y-2">
                        {companyIntel.pain_point_signals.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Trigger events */}
                  {companyIntel.trigger_events.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Trigger Events</p>
                      <ul className="space-y-2">
                        {companyIntel.trigger_events.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Buying signals */}
                  {companyIntel.buying_signals.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Buying Signals</p>
                      <ul className="space-y-2">
                        {companyIntel.buying_signals.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Opening angles */}
                  {companyIntel.opening_angles.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Opening Angles</p>
                      <ul className="space-y-2">
                        {companyIntel.opening_angles.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Record drawer — fixed, full viewport height, slides in from right */}
      {recordDrawer != null && (
        <div className="sm:hidden fixed inset-0 z-[60] bg-black/30" onClick={closeRecord} />
      )}
      <div
        className={`fixed top-0 right-0 h-screen bg-white border-l border-gray-200 shadow-2xl z-[61] flex flex-col overflow-hidden transition-all ease-out ${
          recordDrawer != null ? 'w-full sm:w-[400px]' : 'w-0'
        }`}
        style={{ transitionDuration: '200ms' }}
        onClick={e => e.stopPropagation()}
      >
        {recordDrawer != null && (
          <>
            <div className="flex items-center justify-end px-3 py-2 border-b border-gray-100 flex-shrink-0 bg-white">
              <button type="button" onClick={closeRecord} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <iframe
              key={`${recordDrawer.type}-${recordDrawer.id}`}
              src={`/${recordDrawer.type === 'attendee' ? 'attendees' : recordDrawer.type === 'company' ? 'companies' : 'conferences'}/${recordDrawer.id}?embed=true`}
              className="flex-1 border-0 w-full"
              title={`${recordDrawer.type} record`}
            />
          </>
        )}
      </div>
    </div>
  );
}
