import { useState } from 'react';

interface DriverBattlePortraitProps {
    src: string;
    side: 'left' | 'right';
}

export function DriverBattlePortrait({ src, side }: DriverBattlePortraitProps) {
    const [failed, setFailed] = useState(false);

    if (failed) return null;

    return (
        <div className="h2h-battle__portrait" data-side={side} aria-hidden="true">
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
