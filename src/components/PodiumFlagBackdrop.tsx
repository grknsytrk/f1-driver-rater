import { useId, useRef, type CSSProperties } from 'react';
import { useInView } from 'framer-motion';
import * as Flags from 'country-flag-icons/react/3x2';
import { NATIONALITY_CODES } from '../utils/countryCodes';

const STRIP_COUNT = 48;
const FLAG_WIDTH = 600;
const FLAG_HEIGHT = 400;
const strips = Array.from({ length: STRIP_COUNT }, (_, index) => index);

interface PodiumFlagBackdropProps {
    nationality: string;
}

export function PodiumFlagBackdrop({ nationality }: PodiumFlagBackdropProps) {
    const flagId = `podium-flag-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const backdropRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(backdropRef);
    const countryCode = NATIONALITY_CODES[nationality.trim()];
    const Flag = countryCode ? Flags[countryCode] : undefined;

    if (!Flag) return null;

    return (
        <div
            ref={backdropRef}
            className="podium-flag"
            data-country={countryCode}
            data-animated={isInView}
            aria-hidden="true"
        >
            {/* Share one flag drawing between the slices, including detailed emblems. */}
            <svg width="0" height="0" className="absolute" focusable="false">
                <defs>
                    <g id={flagId}>
                        <Flag width={FLAG_WIDTH} height={FLAG_HEIGHT} />
                    </g>
                </defs>
            </svg>
            <div className="podium-flag__cloth">
                {strips.map(index => {
                    const progress = index / (STRIP_COUNT - 1);
                    const style = {
                        left: `${index / STRIP_COUNT * 100}%`,
                        '--wave-delay': `${-index * 0.12}s`,
                        '--wave-lift': 3 + progress * 15,
                        '--wave-lean': `${2 + progress * 4}deg`,
                    } as CSSProperties;

                    return (
                        <div key={index} className="podium-flag__strip" style={style}>
                            <svg
                                viewBox={`${index * FLAG_WIDTH / STRIP_COUNT} 0 ${FLAG_WIDTH / STRIP_COUNT} ${FLAG_HEIGHT}`}
                                preserveAspectRatio="none"
                                focusable="false"
                            >
                                <use href={`#${flagId}`} />
                            </svg>
                            <div className="podium-flag__fold" />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
