'use client';

import { CUSTOM_CSS_MAX_BYTES, buildBadgeUrl, type WidgetConfig } from '@bugping/shared';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { updateProjectSettingsAction } from '@/app/app/actions';
import { utf8ByteLength } from '@/lib/dashboard/bytes';
import type { ProjectDetail } from '@/lib/dashboard/projects';
import type { SettingsInput } from '@/lib/dashboard/settings';
import { WidgetPreview } from './widget-preview';

const LOCALE_NAMES = { en: 'English', ru: 'Русский', uk: 'Українська', es: 'Español' } as const;

export function SettingsForm({
  project,
  pro,
  appUrl,
}: {
  project: ProjectDetail;
  pro: boolean;
  appUrl: string;
}) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<SettingsInput>({
    name: project.name,
    primaryColor: project.primary_color,
    triggerText: project.trigger_text,
    position: project.position,
    locale: project.locale,
    allowedOrigins: project.allowed_origins,
    hideBadge: project.hide_badge,
    customCss: project.custom_css ?? '',
  });
  const [originsText, setOriginsText] = useState(project.allowed_origins.join('\n'));
  const set = <K extends keyof SettingsInput>(key: K, value: SettingsInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const cssBytes = utf8ByteLength(form.customCss);
  const preview: WidgetConfig = {
    primaryColor: /^#[0-9a-fA-F]{6}$/.test(form.primaryColor) ? form.primaryColor : '#6366f1',
    triggerText: form.triggerText.trim() || 'Feedback',
    position: form.position,
    showBadge: !(pro && form.hideBadge),
    customCss: pro && form.customCss.trim() ? form.customCss : null,
    badgeUrl: buildBadgeUrl(project.public_key, appUrl),
    locale: form.locale,
  };

  const save = () =>
    start(async () => {
      const allowedOrigins = originsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await updateProjectSettingsAction(project.id, { ...form, allowedOrigins });
      if (result.ok) toast.success(t('settings.saved'));
      else toast.error(t(result.error));
    });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <form className="flex flex-col gap-5" action={save}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t('settings.name')}</Label>
          <Input
            id="name"
            value={form.name}
            maxLength={80}
            onChange={(e) => set('name', e.target.value)}
            data-testid="settings-name"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="color">{t('settings.color')}</Label>
          <div className="flex items-center gap-2">
            <input
              id="color"
              type="color"
              value={preview.primaryColor}
              onChange={(e) => set('primaryColor', e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border"
              data-testid="settings-color"
            />
            <Input
              value={form.primaryColor}
              onChange={(e) => set('primaryColor', e.target.value)}
              className="w-32"
              data-testid="settings-color-hex"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="trigger">{t('settings.trigger')}</Label>
          <Input
            id="trigger"
            value={form.triggerText}
            maxLength={40}
            onChange={(e) => set('triggerText', e.target.value)}
            data-testid="settings-trigger"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="position">{t('settings.position')}</Label>
            <select
              id="position"
              value={form.position}
              onChange={(e) => set('position', e.target.value as SettingsInput['position'])}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              data-testid="settings-position"
            >
              <option value="bottom-right">{t('settings.position_bottom-right')}</option>
              <option value="bottom-left">{t('settings.position_bottom-left')}</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="locale">{t('settings.locale')}</Label>
            <select
              id="locale"
              value={form.locale}
              onChange={(e) => set('locale', e.target.value as SettingsInput['locale'])}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              data-testid="settings-locale"
            >
              <option value="auto">{t('settings.locale_auto')}</option>
              {Object.entries(LOCALE_NAMES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="origins">{t('settings.origins')}</Label>
          <Textarea
            id="origins"
            rows={4}
            value={originsText}
            onChange={(e) => setOriginsText(e.target.value)}
            placeholder="https://example.com"
            data-testid="settings-origins"
          />
          <p className="text-xs text-muted-foreground">{t('settings.originsHint')}</p>
        </div>
        <fieldset
          disabled={!pro}
          className="flex flex-col gap-4 rounded-lg border p-4 disabled:opacity-60"
        >
          <legend className="px-1 text-xs font-medium">🔒 {t('settings.proOnly')}</legend>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={form.hideBadge}
              onCheckedChange={(v) => set('hideBadge', v)}
              disabled={!pro}
              data-testid="settings-hide-badge"
            />
            {t('settings.hideBadge')}
          </label>
          <div className="flex flex-col gap-2">
            <Label htmlFor="css">{t('settings.customCss')}</Label>
            <Textarea
              id="css"
              rows={6}
              className="font-mono text-xs"
              value={form.customCss}
              onChange={(e) => set('customCss', e.target.value)}
              data-testid="settings-css"
            />
            <p
              className={`text-xs ${cssBytes > CUSTOM_CSS_MAX_BYTES ? 'text-destructive' : 'text-muted-foreground'}`}
              data-testid="settings-css-bytes"
            >
              {t('settings.cssBytes', { used: cssBytes, max: CUSTOM_CSS_MAX_BYTES })}
            </p>
          </div>
        </fieldset>
        <Button
          type="submit"
          disabled={pending || cssBytes > CUSTOM_CSS_MAX_BYTES}
          data-testid="settings-save"
          className="self-start"
        >
          {t('common.save')}
        </Button>
      </form>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{t('settings.preview')}</h2>
        <WidgetPreview config={preview} />
      </section>
    </div>
  );
}
