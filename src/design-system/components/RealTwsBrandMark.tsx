import type { CSSProperties } from 'react';
import { REAL_TWS_BRAND_IDENTITY } from '../tokens/designTokens';

interface RealTwsMonogramProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Medallón circular negro mate con el monograma entrelazado "Rws" en oro
 * arenado/cepillado 3D, fiel a la referencia artística #2.
 */
export function RealTwsMonogram({
  size = 40,
  className = '',
  style
}: RealTwsMonogramProps) {
  return (
    <span
      className={`rtw-rws-medallion ${className}`.trim()}
      style={{
        width: size,
        height: size,
        ...style
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        <defs>
          <radialGradient id="rtwMedallionObsidian" cx="48%" cy="30%" r="72%">
            <stop offset="0%" stopColor="#1b1e26" />
            <stop offset="60%" stopColor="#0d0f13" />
            <stop offset="100%" stopColor="#060709" />
          </radialGradient>
          <linearGradient id="rtwSandblastedGold" x1="0%" y1="0%" x2="95%" y2="100%">
            <stop offset="0%" stopColor="#fff6cc" />
            <stop offset="24%" stopColor="#efd27b" />
            <stop offset="52%" stopColor="#d4af37" />
            <stop offset="78%" stopColor="#b3881d" />
            <stop offset="100%" stopColor="#775811" />
          </linearGradient>
          <linearGradient id="rtwMedallionRim" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fff4c4" />
            <stop offset="38%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#664a0e" />
          </linearGradient>
          <filter id="rtwMonogramDepth" x="-20%" y="-20%" width="140%" height="145%">
            <feDropShadow dx="0" dy="4" stdDeviation="3.2" floodColor="#000000" floodOpacity="0.82" />
          </filter>
        </defs>
        <circle
          cx="100"
          cy="100"
          r="95"
          fill="url(#rtwMedallionObsidian)"
          stroke="url(#rtwMedallionRim)"
          strokeWidth="4.5"
        />
        <circle
          cx="100"
          cy="100"
          r="88"
          fill="none"
          stroke="rgba(255, 246, 204, 0.18)"
          strokeWidth="1"
        />
        <g filter="url(#rtwMonogramDepth)">
          <text
            x="70"
            y="138"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontWeight="700"
            fontSize="124"
            fill="url(#rtwSandblastedGold)"
          >
            R
          </text>
          <text
            x="136"
            y="130"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontWeight="700"
            fontSize="58"
            fill="url(#rtwSandblastedGold)"
            letterSpacing="-2"
          >
            ws
          </text>
        </g>
      </svg>
    </span>
  );
}

interface RealTwsPlaqueBannerProps {
  compact?: boolean;
  showContactPill?: boolean;
  subtitleOverride?: string;
  className?: string;
}

/**
 * Placa ejecutiva en negro obsidiana mate con marco metálico dorado,
 * destello especular central superior, tipografía 3D "REAL TWS",
 * cápsula WhatsApp "3 2 0 6 9 8 8 0 1 3" y lema "AURICULARES PREMIUM"
 * fiel a la referencia artística #1.
 */
export function RealTwsPlaqueBanner({
  compact = false,
  showContactPill = true,
  subtitleOverride,
  className = ''
}: RealTwsPlaqueBannerProps) {
  return (
    <div
      className={`rtw-signature-plaque ${compact ? 'rtw-signature-plaque-compact' : ''} ${className}`.trim()}
    >
      <div className="rtw-signature-plaque-flare" aria-hidden="true" />
      <div className="rtw-signature-plaque-inner">
        <div className="rtw-signature-plaque-wordmark" aria-label="REAL TWS">
          <span className="rtw-gold-3d-text">REAL</span>
          <span className="rtw-gold-3d-text">TWS</span>
        </div>

        <div className="rtw-signature-plaque-hairline" aria-hidden="true" />

        {showContactPill && (
          <div className="rtw-signature-plaque-pill">
            <span className="rtw-signature-plaque-wa-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </span>
            <span className="rtw-signature-plaque-phone">3 2 0 6 9 8 8 0 1 3</span>
          </div>
        )}

        <div className="rtw-signature-plaque-tagline-row">
          <span className="rtw-signature-plaque-wing" aria-hidden="true" />
          <span className="rtw-signature-plaque-tagline">
            {subtitleOverride || REAL_TWS_BRAND_IDENTITY.tagline}
          </span>
          <span className="rtw-signature-plaque-wing" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
