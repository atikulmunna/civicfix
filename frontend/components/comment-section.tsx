'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Comment } from '@/lib/types';
import { useFormat } from '@/lib/i18n/use-format';
import { isAdmin, useAuth } from './auth-context';
import { useToast } from './toast';
import { Button, LoadError, Textarea } from './ui';

export function CommentSection({ reportId }: { reportId: string }) {
  const t = useTranslations('comments');
  const f = useFormat();
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
    onError: (err) => toast(errorMessage(err, t('postError')), 'error'),
  });
  const busy = post.isPending;

  const removeComment = useMutation({
    mutationFn: (id: string) => api.del(`/comments/${id}`),
    onSuccess: (_result, id) => updateComments((c) => c.filter((x) => x.id !== id)),
    onError: (err) => toast(errorMessage(err, t('deleteError')), 'error'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    post.mutate(content);
  }
  const remove = (id: string) => removeComment.mutate(id);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900">
        {t('heading', { count: comments.length })}
      </h2>

      {commentsQuery.isPending ? (
        <p className="text-sm text-slate-500">{t('loading')}</p>
      ) : commentsQuery.isError ? (
        <LoadError>{errorMessage(commentsQuery.error, t('loadError'))}</LoadError>
      ) : comments.length === 0 ? (
        <p className="text-sm text-slate-500">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-900">{c.author.name}</span>
                <span className="text-xs text-slate-400">{f.dateTime(c.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{c.content}</p>
              {(user?.id === c.author.id || isAdmin(user)) && (
                <button
                  onClick={() => remove(c.id)}
                  className="mt-2 text-xs text-red-600 hover:underline"
                >
                  {t('delete')}
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
            placeholder={t('placeholder')}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            aria-label={t('addLabel')}
          />
          <div>
            <Button type="submit" disabled={busy || !content.trim()}>
              {busy ? t('posting') : t('post')}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-slate-600">
          {t.rich('signInPrompt', {
            link: (chunks) => (
              <Link href="/login" className="font-medium text-teal-700 hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
    </div>
  );
}
