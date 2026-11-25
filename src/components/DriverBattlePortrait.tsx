import { useState } from 'react';

interface DriverBattlePortraitProps {
    src: string;
    side: 'left' | 'right';
    align?: 'top' | 'bottom';
}

export function DriverBattlePortrait({ src, side, align = 'bottom' }: DriverBattlePortraitProps) {
    const [failed, setFailed] = useState(false);

    if (failed) return null;

    const isHeadshot = /\/images\/drivers\/(2019|2020|2021|2022|2023)\//.test(src);

    return (
        <div
            className="h2h-battle__portrait"
            data-side={side}
            data-format={isHeadshot ? 'headshot' : 'full'}
            data-align={align}
            aria-hidden="true"
        >
            <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                onError={() => setFailed(true)}
            />
        </div>
    );
}
