import {useId, useState} from 'react';
import {Repeat1, Shuffle, Timer} from 'lucide-react';
import {useGlobalAudioPlayer} from '@/contexts/AudioPlayerContext';
import {PLAYBACK_RATES} from '@/hooks/useAudioEngine';

function SettingsControls() {
    const id = useId();
    const {playbackRate, setPlaybackRate, repeatOne, toggleRepeatOne, shuffleQueue, upcoming,
        sleepTimer, sleepRemainingSeconds, setSleepTimer, sleepFadeOut, setSleepFadeOut} = useGlobalAudioPlayer();
    const selectClass = 'w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-sm';
    return <div className="space-y-3 pt-3">
        <div className="grid grid-cols-2 gap-3">
            <div>
                <label htmlFor={`${id}-speed`} className="mb-1 block text-xs text-[var(--muted-foreground)]">Playback speed</label>
                <select id={`${id}-speed`} value={playbackRate} onChange={event => setPlaybackRate(Number(event.target.value))} className={selectClass}>
                    {PLAYBACK_RATES.map(rate => <option key={rate} value={rate}>{rate}×</option>)}
                </select>
            </div>
            <div>
                <label htmlFor={`${id}-sleep`} className="mb-1 block text-xs text-[var(--muted-foreground)]">Sleep timer</label>
                <select id={`${id}-sleep`} value={sleepTimer.mode === 'deadline' ? sleepTimer.minutes : sleepTimer.mode}
                    onChange={event => { const value = event.target.value; setSleepTimer(value === 'off' || value === 'track' ? value : Number(value)); }} className={selectClass}>
                    <option value="off">Off</option>
                    <option value="track">After this track</option>
                    {[15, 30, 45, 60, 90].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
                </select>
            </div>
        </div>
        {sleepTimer.mode !== 'off' && <p className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <Timer className="h-3.5 w-3.5 shrink-0" />
            <span>{sleepTimer.mode === 'track' ? 'Stops when the track ends, before repeat or autoplay.' : `Stops in ${Math.floor(sleepRemainingSeconds / 60)}:${String(sleepRemainingSeconds % 60).padStart(2, '0')}.`}</span>
        </p>}
        {sleepTimer.mode === 'deadline' && <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={sleepFadeOut} onChange={event => setSleepFadeOut(event.target.checked)} />
            Fade out over the last 10 seconds
        </label>}
        <div className="flex flex-wrap gap-2">
            <button type="button" onClick={toggleRepeatOne} aria-pressed={repeatOne} className={`flex items-center gap-2 rounded-md border px-2 py-2 text-xs ${repeatOne ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-[var(--border)]'}`}>
                <Repeat1 className="h-4 w-4" /> Repeat track
            </button>
            <button type="button" onClick={shuffleQueue} title="Shuffle queued and folder tracks separately; added tracks stay first" disabled={upcoming.length < 2} className="flex items-center gap-2 rounded-md border border-[var(--border)] px-2 py-2 text-xs disabled:opacity-40">
                <Shuffle className="h-4 w-4" /> Shuffle upcoming
            </button>
        </div>
    </div>;
}

export default function PlaybackSettings() {
    const [open, setOpen] = useState(false);
    return <details className="shrink-0 border-t border-[var(--border)] px-3 py-3" onToggle={event => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm">Playback settings</summary>
        {open && <SettingsControls />}
    </details>;
}
