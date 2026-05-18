'use client';

import { useParams } from 'next/navigation';
import { MeetingNotetaker } from '@/components/MeetingNotetaker';

export default function MeetingNotesPage() {
  const { id } = useParams();
  return <MeetingNotetaker meetingId={Number(id)} />;
}
