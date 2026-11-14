'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import type { Report } from '@/lib/types';
import { SEVERITY_OPTIONS } from '@/lib/format';
import { useFormat } from '@/lib/i18n/use-format';
import { invalidateReportLists } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import {
  MAX_PHOTOS,
  UPLOAD_BUDGET_BYTES,
  megabytes,
  prepareImages,
  totalBytes,
} from '@/lib/resize-image';
import { RequireAuth } from '@/components/require-auth';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  FieldError,
  Input,
  Label,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui';
import type { LatLng } from '@/components/location-picker';
import Link from 'next/link';

function MapLoading() {
  const t = useTranslations('newReport');
  return <Spinner label={t('loadingMap')} />;
}

const LocationPicker = dynamic(
  () => import('@/components/location-picker').then((m) => m.LocationPicker),
  { ssr: false, loading: MapLoading },
);

function NewReportForm() {
  const t = useTranslations('newReport');
  const f = useFormat();
  const router = useRouter();
  const { toast } = useToast();
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
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // Resizing photos happens before the request; the mutation covers the upload.
  const [preparing, setPreparing] = useState(false);
  const submit = useMutation({
    mutationFn: (fd: FormData) => api.postForm('/reports', fd),
    onSuccess: async ({ report }) => {
      // The new report belongs in every list (yours, the public one, the map).
      await invalidateReportLists(queryClient);
      toast(t('submitted'), 'success');
      router.push(`/reports/${report.id}`);
    },
    onError: (err) => setError(errorMessage(err, t('errors.submitFailed'))),
  });
  const busy = preparing || submit.isPending;

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => api.get('/categories', undefined, { signal }),
    select: (d) => d.categories,
  });
  const categories = categoriesQuery.data ?? [];

  // Check for possible duplicates when category + location are set (REP-009),
  // debounced so dragging the pin does not fire a request per move.
  const dupParams = useMemo(
    () =>
      location && form.categoryId
        ? { categoryId: form.categoryId, latitude: location.lat, longitude: location.lng }
        : null,
    [location, form.categoryId],
  );
  const debouncedDupParams = useDebouncedValue(dupParams, 400);
  const duplicatesQuery = useQuery({
    queryKey: queryKeys.duplicates(debouncedDupParams),
    // skipToken: no request until category and location are both set.
    queryFn: debouncedDupParams
      ? ({ signal }) => api.post('/reports/check-duplicates', debouncedDupParams, { signal })
      : skipToken,
    select: (d) => d.possibleDuplicates,
  });
  // Advisory only: hide the hint when the inputs are cleared or the check fails.
  const duplicates: Report[] = dupParams && debouncedDupParams ? (duplicatesQuery.data ?? []) : [];

  const previews = useMemo(
    () => files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })),
    [files],
  );
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  function pickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length > MAX_PHOTOS) {
      e.target.value = '';
      setFiles([]);
      setError(t('errors.tooManyPhotos', { max: MAX_PHOTOS }));
      return;
    }
    setError(null);
    setFiles(picked);
  }

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: e.target.value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!location) return setError(t('errors.noLocation'));
    if (files.length === 0) return setError(t('errors.noPhoto'));

    setPreparing(true);
    const images = await prepareImages(files);
    setPreparing(false);
    const size = totalBytes(images);
    if (size > UPLOAD_BUDGET_BYTES) {
      return setError(
        t('errors.tooLarge', { size: megabytes(size), limit: megabytes(UPLOAD_BUDGET_BYTES) }),
      );
    }

    const fd = new FormData();
    fd.set('title', form.title);
    fd.set('description', form.description);
    fd.set('categoryId', form.categoryId);
    fd.set('severity', form.severity);
    fd.set('latitude', String(location.lat));
    fd.set('longitude', String(location.lng));
    if (form.address) fd.set('address', form.address);
    if (form.landmark) fd.set('landmark', form.landmark);
    images.forEach((image) => fd.append('images', image));

    submit.mutate(fd);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        className="mb-6"
      />
      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div>
            <Label htmlFor="title">{t('fields.title')}</Label>
            <Input
              id="title"
              value={form.title}
              onChange={update('title')}
              required
              minLength={3}
            />
          </div>
          <div>
            <Label htmlFor="description">{t('fields.description')}</Label>
            <Textarea
              id="description"
              rows={4}
              value={form.description}
              onChange={update('description')}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="category">{t('fields.category')}</Label>
              <Select
                id="category"
                value={form.categoryId}
                onChange={update('categoryId')}
                required
              >
                <option value="">{t('fields.choose')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="severity">{t('fields.severity')}</Label>
              <Select id="severity" value={form.severity} onChange={update('severity')}>
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {f.severity(s)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label>{t('fields.location')}</Label>
            <LocationPicker value={location} onChange={setLocation} />
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-800">
                {t('duplicates', { count: duplicates.length })}
              </p>
              <ul className="mt-1 list-disc pl-5 text-amber-900">
                {duplicates.slice(0, 3).map((d) => (
                  <li key={d.id}>
                    <Link href={`/reports/${d.id}`} className="hover:underline" target="_blank">
                      {d.title}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-amber-700">{t('duplicatesNote')}</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="address">{t('fields.address')}</Label>
              <Input id="address" value={form.address} onChange={update('address')} />
            </div>
            <div>
              <Label htmlFor="landmark">{t('fields.landmark')}</Label>
              <Input id="landmark" value={form.landmark} onChange={update('landmark')} />
            </div>
          </div>

          <div>
            <Label htmlFor="images">{t('fields.photos')}</Label>
            <p id="images-hint" className="mb-1 text-xs text-slate-500">
              {t('photosHint', { max: MAX_PHOTOS })}
            </p>
            <input
              id="images"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              aria-describedby="images-hint"
              onChange={pickPhotos}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
            />
            {previews.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {previews.map((p) => (
                  // Local blob: previews of files not yet uploaded; the image
                  // optimizer cannot fetch them, so a plain img is correct here.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p.url}
                    src={p.url}
                    alt={p.name}
                    className="h-16 w-16 rounded object-cover"
                  />
                ))}
              </div>
            )}
          </div>

          <FieldError>{error}</FieldError>
          <div>
            <Button type="submit" disabled={busy}>
              {preparing ? t('preparing') : submit.isPending ? t('submitting') : t('submit')}
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
