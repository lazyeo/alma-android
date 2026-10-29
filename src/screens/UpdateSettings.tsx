import { Download, ExternalLink, RefreshCw, Rocket } from 'lucide-react'
import { useT } from '../i18n'
import { useUpdates } from '../updates/UpdateProvider'
import { SettingsRow } from '../components/SettingsRow'
import { MarkdownContent } from './MarkdownContent'

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange(checked: boolean): void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className="settings-switch"
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

export function UpdateSettings() {
  const t = useT()
  const updates = useUpdates()
  if (!updates.ready || updates.eligibility === 'hidden') return null

  const version = `${updates.runtime?.versionName ?? ''}${updates.runtime?.sha ? ` (${updates.runtime.sha.slice(0, 7)})` : ''}`
  const checking = updates.status === 'checking'
  const downloading = updates.downloadStatus === 'downloading'
  const errorKey = updates.error
    ? (`settings.updates.errors.${updates.error}` as const)
    : undefined
  const installErrorKey = updates.installError
    ? (`settings.updates.installErrors.${updates.installError}` as const)
    : undefined

  return (
    <section
      className="settings-section update-settings"
      aria-labelledby="updates-heading"
    >
      <h2 id="updates-heading" className="settings-section-title">
        {t('settings.updates.title')}
      </h2>
      <div className="settings-group">
        <SettingsRow
          icon={<Rocket size={17} />}
          title={t('settings.about.version')}
          trailing={
            <span className="settings-value update-version">{version}</span>
          }
        />
        <SettingsRow
          icon={<RefreshCw size={17} />}
          title={t('settings.updates.automatic')}
          secondary={t('settings.updates.automaticHint')}
          trailing={
            <Switch
              label={t('settings.updates.automatic')}
              checked={updates.autoCheck}
              onChange={updates.setAutoCheck}
            />
          }
        />
      </div>

      <div className="update-panel" aria-live="polite">
        <div className="update-status-line">
          <strong>
            {checking
              ? t('settings.updates.checking')
              : updates.status === 'current'
                ? t('settings.updates.current')
                : updates.release
                  ? t('settings.updates.available', {
                      version: updates.release.version,
                    })
                  : errorKey
                    ? t(errorKey)
                    : t('settings.updates.ready')}
          </strong>
          {downloading ? (
            <span>{Math.round(updates.progress * 100)}%</span>
          ) : null}
        </div>

        {updates.release?.notes ? (
          <MarkdownContent
            text={updates.release.notes}
            references={false}
            className="update-release-notes"
          />
        ) : null}
        {installErrorKey ? (
          <p className="settings-error">{t(installErrorKey)}</p>
        ) : null}
        {downloading ? (
          <progress
            className="update-progress"
            max={1}
            value={updates.progress}
            aria-label={t('settings.updates.downloadProgress')}
          />
        ) : null}

        <div className="update-actions">
          <button
            className="secondary"
            disabled={checking}
            onClick={() => void updates.check()}
          >
            <RefreshCw size={16} />
            {t('settings.updates.check')}
          </button>
          {updates.release ? (
            <button className="secondary" onClick={updates.openRelease}>
              <ExternalLink size={16} />
              {t('settings.updates.viewGitHub')}
            </button>
          ) : null}
          {updates.release?.apk && updates.eligibility === 'native' ? (
            downloading ? (
              <button
                className="secondary"
                onClick={() => void updates.cancelDownload()}
              >
                {t('settings.updates.cancel')}
              </button>
            ) : (
              <button
                className="primary"
                onClick={() => void updates.downloadAndInstall()}
              >
                <Download size={16} />
                {t('settings.updates.install')}
              </button>
            )
          ) : null}
          {updates.release ? (
            <button className="quiet" onClick={updates.openDownload}>
              {t('settings.updates.browser')}
            </button>
          ) : null}
          {updates.release ? (
            <button className="quiet" onClick={updates.skip}>
              {t('settings.updates.skip')}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
