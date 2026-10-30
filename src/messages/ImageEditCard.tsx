import { useT } from '../i18n'
import {
  isLightColor,
  type ImageEditRequest,
} from '../components/imageAnnotatorModel'

export function ImageEditCard({ request }: { request: ImageEditRequest }) {
  const t = useT()
  return (
    <section
      className="image-edit-card"
      aria-label={t('message.imageEdit.title')}
    >
      <h3>{t('message.imageEdit.title')}</h3>
      <div className="image-edit-rows">
        {request.regions.map((region) => (
          <div
            className="image-edit-row"
            key={`${region.index}-${region.color}`}
          >
            <span
              className="image-edit-number"
              style={
                {
                  '--image-edit-color': region.color,
                  '--image-edit-ink': isLightColor(region.color)
                    ? 'var(--gray-12)'
                    : '#ffffff',
                } as React.CSSProperties
              }
            >
              {region.index}
            </span>
            <span>
              {region.label ||
                t('message.imageEdit.request', { number: region.index })}
            </span>
          </div>
        ))}
      </div>
      {request.note ? (
        <div className="image-edit-note">
          <strong>{t('message.imageEdit.note')}</strong>
          <p>{request.note}</p>
        </div>
      ) : null}
    </section>
  )
}
