'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Comment } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { isAdmin, useAuth } from './auth-context';
import { useToast } from './toast';
import { Button, Textarea } from './ui';

export function CommentSection({ reportId }: { reportId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ comments: Comment[] }>(`/reports/${reportId}/comments`)
      .then((d) => setComments(d.comments))
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [reportId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try {
      const { comment } = await api.post<{ comment: Comment }>(`/reports/${reportId}/comments`, { content });
      setComments((c) => [...c, comment]);
      setContent('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not post comment.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/comments/${id}`);
      setComments((c) => c.filter((x) => x.id !== id));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete comment.', 'error');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900">Comments ({comments.length})</h2>

      {loading ? (
        <p className="text-sm text-slate-500">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-slate-500">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-900">{c.author.name}</span>
                <span className="text-xs text-slate-400">{formatDateTime(c.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{c.content}</p>
              {(user?.id === c.author.id || isAdmin(user)) && (
                <button
                  onClick={() => remove(c.id)}
                  className="mt-2 text-xs text-red-600 hover:underline"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {user ? (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <Textarea
            rows={3}
            placeholder="Add a comment…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            aria-label="Add a comment"
          />
          <div>
            <Button type="submit" disabled={busy || !content.trim()}>
              {busy ? 'Posting…' : 'Post comment'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-slate-600">
          <Link href="/login" className="font-medium text-teal-700 hover:underline">Sign in</Link> to comment.
        </p>
      )}
    </div>
  );
}
