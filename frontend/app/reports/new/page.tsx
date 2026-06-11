'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { Category, Report } from '@/lib/types';
import { SEVERITY_OPTIONS, severityLabel } from '@/lib/format';
import { RequireAuth } from '@/components/require-auth';
import { useToast } from '@/components/toast';
import { Button, Card, FieldError, Input, Label, Select, Spinner, Textarea } from '@/components/ui';
import type { LatLng } from '@/components/location-picker';
import Link from 'next/link';

const LocationPicker = dynamic(
  () => import('@/components/location-picker').then((m) => m.LocationPicker),
  { ssr: false, loading: () => <Spinner label="Loading map…" /> },
);

function NewReportForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    categoryId: '',
    severity: 'medium',
    address: '',
    landmark: '',
  });
  const [location, setLocation] = useState<LatLng | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [duplicates, setDuplicates] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ categories: Category[] }>('/categories').then((d) => setCategories(d.categories)).catch(() => {});
  }, []);

  // Check for possible duplicates when category + location are set (REP-009).
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!location || !form.categoryId) {
      setDuplicates([]);
      return;
    }
    if (dupTimer.current) clearTimeout(dupTimer.current);
    dupTimer.current = setTimeout(() => {
      api
        .post<{ possibleDuplicates: Report[] }>('/reports/check-duplicates', {
          categoryId: form.categoryId,
          latitude: location.lat,
          longitude: location.lng,
        })
        .then((d) => setDuplicates(d.possibleDuplicates))
        .catch(() => setDuplicates([]));
    }, 400);
  }, [location, form.categoryId]);

  const previews = useMemo(() => files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!location) return setError('Please select a location on the map.');
    if (files.length === 0) return setError('Please add at least one photo.');

    const fd = new FormData();
    fd.set('title', form.title);
    fd.set('description', form.description);
    fd.set('categoryId', form.categoryId);
    fd.set('severity', form.severity);
    fd.set('latitude', String(location.lat));
    fd.set('longitude', String(location.lng));
    if (form.address) fd.set('address', form.address);
    if (form.landmark) fd.set('landmark', form.landmark);
    files.forEach((f) => fd.append('images', f));

    setBusy(true);
    try {
      const { report } = await api.postForm<{ report: Report }>('/reports', fd);
      toast('Report submitted. Thank you!', 'success');
      router.push(`/reports/${report.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit the report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Report an issue</h1>
      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={form.title} onChange={update('title')} required minLength={3} />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={4} value={form.description} onChange={update('description')} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="category">Category</Label>
              <Select id="category" value={form.categoryId} onChange={update('categoryId')} required>
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="severity">Severity</Label>
              <Select id="severity" value={form.severity} onChange={update('severity')}>
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>{severityLabel(s)}</option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label>Location</Label>
            <LocationPicker value={location} onChange={setLocation} />
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-800">Possible duplicate{duplicates.length > 1 ? 's' : ''} nearby:</p>
              <ul className="mt-1 list-disc pl-5 text-amber-900">
                {duplicates.slice(0, 3).map((d) => (
                  <li key={d.id}>
                    <Link href={`/reports/${d.id}`} className="hover:underline" target="_blank">
                      {d.title}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-amber-700">You can still submit if yours is different.</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="address">Address (optional)</Label>
              <Input id="address" value={form.address} onChange={update('address')} />
            </div>
            <div>
              <Label htmlFor="landmark">Landmark (optional)</Label>
              <Input id="landmark" value={form.landmark} onChange={update('landmark')} />
            </div>
          </div>

          <div>
            <Label htmlFor="images">Photos</Label>
            <input
              id="images"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
            />
            {previews.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {previews.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.url} src={p.url} alt={p.name} className="h-16 w-16 rounded object-cover" />
                ))}
              </div>
            )}
          </div>

          <FieldError>{error}</FieldError>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit report'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function NewReportPage() {
  return (
    <RequireAuth>
      <NewReportForm />
    </RequireAuth>
  );
}
