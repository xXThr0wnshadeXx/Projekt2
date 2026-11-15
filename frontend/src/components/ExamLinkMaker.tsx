// For instructors: make an exam link — issue #189.
//
// The link opens Glance locked to exam mode until it expires. Anyone may make
// one, because a link can only take features away: reading, exploring and
// writing always work, and step checks and word meanings are switched off.

import { useState } from 'react';
import { announce } from './LiveRegion';
import { ApiFailure, createExamLink } from '../api';

const LENGTHS = [30, 60, 90, 120, 180];

export function ExamLinkMaker() {
  const [minutes, setMinutes] = useState(90);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  async function make() {
    setBusy(true);
    try {
      const { token, expires_at } = await createExamLink(minutes);
      const url = `${window.location.origin}/?exam=${encodeURIComponent(token)}`;
      setLink(url);
      const until = new Date(expires_at * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      announce(`Exam link ready. It locks Glance to exam mode until ${until}. Copy it and send it to your students.`);
    } catch (e: unknown) {
      announce(e instanceof ApiFailure ? e.message : 'I could not make an exam link.', 'assertive');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      announce('Exam link copied.');
    } catch {
      announce('I could not copy it. Select the link and copy it yourself.');
    }
  }

  return (
    <section aria-labelledby="exam-link-heading" className="mt-8">
      <h3 id="exam-link-heading" className="text-lg font-semibold">
        For instructors: an exam link
      </h3>
      <p className="mt-1 text-sm text-[--muted]">
        Students who open it get Glance locked to exam mode until it expires: it reads and writes
        down their work, with no step checking and no word meanings. They cannot switch it off.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Exam length</span>
          <select
            className="min-h-[48px] rounded-lg border border-[--line] bg-[--surface] px-3"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {LENGTHS.map((m) => (
              <option key={m} value={m}>{m} minutes</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" disabled={busy} onClick={() => void make()}>
          Make exam link
        </button>
      </div>
      {link && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-medium">Exam link</span>
            <input
              readOnly
              value={link}
              className="min-h-[48px] w-full rounded-lg border border-[--line] bg-[--surface] px-3"
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <button type="button" className="btn" onClick={() => void copy()}>
            Copy link
          </button>
        </div>
      )}
    </section>
  );
}
