'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Comment } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { isAdmin, useAuth } from './auth-context';
import { useToast } from './toast';
import { Button, LoadError, Textarea } from './ui';

export function CommentSection({ reportId }: { reportId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const key = queryKeys.reportComments(reportId);

  const commentsQuery = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.get(`/reports/${reportId}/comments`, undefined, { signal }),
  });
  const comments = commentsQuery.data?.comments ?? [];
  const updateComments = (update: (c: Comment[]) => Comment[]) => {
    queryClient.setQueryData<{ comments: Comment[] }>(key, (d) =>
      d ? { comments: update(d.comments) } : d,
    );
  };

  const post = useMutation({
    mutationFn: (text: string) => api.post(`/reports/${reportId}/comments`, { content: text }),
    onSuccess: ({ comment }) => {
      updateComments((c) => [...c, comment]);
      setContent('');
    },
    onError: (err) => toast(errorMessage(err, 'Could not post comment.'), 'error'),
  });
  const busy = post.isPending;

  const removeComment = useMutation({
    mutationFn: (id: string) => api.del(`/comments/${id}`),
    onSuccess: (_result, id) => updateComments((c) => c.filter((x) => x.id !== id)),
    onError: (err) => toast(errorMessage(err, 'Could not delete comment.'), 'error'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    post.mutate(content);
  }
  const remove = (id: string) => removeComment.mutate(id);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900">Comments ({comments.length})</h2>

      {commentsQuery.isPending ? (
        <p className="text-sm text-slate-500">Loading comments…</p>
      ) : commentsQuery.isError ? (
        <LoadError>{errorMessage(commentsQuery.error, 'Failed to load comments.')}</LoadError>
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
          <Link href="/login" className="font-medium text-teal-700 hover:underline">
            Sign in
          </Link>{' '}
          to comment.
        </p>
      )}
    </div>
  );
}
