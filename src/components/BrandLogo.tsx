import React, { useState } from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'lg';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'sm' }) => {
  const [imgFailed, setImgFailed] = useState(false);

  const sizeClasses = size === 'lg' ? 'w-24 h-24' : 'w-9 h-9';

  if (imgFailed) {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 border border-amber-700/40 flex items-center justify-center shrink-0 shadow-sm`}
        aria-label="Logo Morel financeiro"
      >
        <svg viewBox="0 0 100 100" className="w-full h-full p-1" role="img" aria-label="Morel financeiro">
          <circle cx="50" cy="50" r="46" fill="none" stroke="#78350F" strokeWidth="2.5" />
          <circle cx="50" cy="50" r="39" fill="none" stroke="#78350F" strokeWidth="1" opacity="0.6" />
          <text
            x="50"
            y="47"
            textAnchor="middle"
            fill="#1E293B"
            fontSize="16"
            fontWeight="700"
            fontFamily="sans-serif"
          >
            MOREL
          </text>
          <text
            x="50"
            y="63"
            textAnchor="middle"
            fill="#1E293B"
            fontSize="10.5"
            fontWeight="600"
            fontFamily="sans-serif"
          >
            financeiro
          </text>
        </svg>
      </div>
    );
  }

  return (
    <img
      src="/src/assets/images/morel_financeiro_coin_logo_1795461899915.jpg"
      alt="Logo Morel financeiro"
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      className={`${sizeClasses} rounded-full object-cover shrink-0 border border-amber-300/60 shadow-sm`}
    />
  );
};
