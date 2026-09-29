import Checkbox from '@/components/ui/Checkbox';
import {useId, useState} from 'react';
import Dialog from '@/components/ui/Dialog';
import {Button, IconButton} from '@/components/ui/Button';
import CustomSelect from '@/components/CustomSelect';
import {Repeat1, Shuffle, SlidersHorizontal, Timer, X} from 'lucide-react';
import {useGlobalAudioPlayer} from '@/contexts/AudioPlayerContext';
import {PLAYBACK_RATES} from '@/hooks/useAudioEngine';

function SettingsControls() {
    const id = useId();
    const {playbackRate, setPlaybackRate, repeatOne, toggleRepeatOne, shuffleQueue, upcoming,
        sleepTimer, sleepRemainingSeconds, setSleepTimer, sleepFadeOut, setSleepFadeOut} = useGlobalAudioPlayer();
    return <div className="space-y-3 pt-3">
        <div className="grid grid-cols-2 gap-3">
            <div>
                <label htmlFor={`${id}-speed`} className="mb-1 block text-xs text-[var(--muted-foreground)]">Playback speed</label>
                <CustomSelect id={`${id}-speed`} ariaLabel="Playback speed" fieldSize="md"
                    value={String(playbackRate)} onChange={value => setPlaybackRate(Number(value))}
                    options={PLAYBACK_RATES.map(rate => ({value: String(rate), label: `${rate}×`}))} />
            </div>
            <div>
                <label htmlFor={`${id}-sleep`} className="mb-1 block text-xs text-[var(--muted-foreground)]">Sleep timer</label>
                <CustomSelect id={`${id}-sleep`} ariaLabel="Sleep timer" fieldSize="md"
                    value={String(sleepTimer.mode === 'deadline' ? sleepTimer.minutes : sleepTimer.mode)}
                    onChange={value => setSleepTimer(value === 'off' || value === 'track' ? value : Number(value))}
                    options={[{value: 'off', label: 'Off'}, {value: 'track', label: 'After this track'},
                        ...[15, 30, 45, 60, 90].map(minutes => ({value: String(minutes), label: `${minutes} minutes`}))]} />
            </div>
        </div>
        {sleepTimer.mode !== 'off' && <p className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <Timer className="h-3.5 w-3.5 shrink-0" />
            <span>{sleepTimer.mode === 'track' ? 'Stops when the track ends, before repeat or autoplay.' : `Stops in ${Math.floor(sleepRemainingSeconds / 60)}:${String(sleepRemainingSeconds % 60).padStart(2, '0')}.`}</span>
        </p>}
        {sleepTimer.mode === 'deadline' && <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={sleepFadeOut} onChange={event => setSleepFadeOut(event.target.checked)} />
            Fade out over the last 10 seconds
        </label>}
        <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={repeatOne ? 'selected' : 'secondary'} onClick={toggleRepeatOne} aria-pressed={repeatOne}>
                <Repeat1 className="h-4 w-4" /> Repeat track
            </Button>
            <Button size="sm" variant="secondary" onClick={shuffleQueue} title="Shuffle queued and folder tracks separately; added tracks stay first" disabled={upcoming.length < 2}>
                <Shuffle className="h-4 w-4" /> Shuffle upcoming
            </Button>
        </div>
    </div>;
}

function SettingsDialog({onClose}: {onClose: () => void}) {
    const titleId = useId();

    return <Dialog open onClose={onClose} labelledBy={titleId} className="playback-settings max-w-sm p-4">
        <div className="flex items-center justify-between gap-3">
            <div id={titleId} className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4 text-[var(--primary)]" /> Playback settings</div>
            <IconButton onClick={onClose} aria-label="Close playback settings"><X className="h-4 w-4" /></IconButton>
        </div>
        <SettingsControls />
    </Dialog>;
}

export default function PlaybackSettings({compact = false}: {compact?: boolean}) {
    const [open, setOpen] = useState(false);
    return <>
        <Button variant="ghost" size="sm"
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Playback settings"
            aria-haspopup="dialog"
            title="Playback settings"
        >
            <SlidersHorizontal className="h-4 w-4" />
            {!compact && <span>Playback</span>}
        </Button>
        {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </>;
}
