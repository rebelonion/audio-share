import {AlertCircle, Loader2, Pause, Play, Radio} from 'lucide-react';
import {useGlobalAudioPlayer} from '@/contexts/AudioPlayerContext';

interface SharePagePlayerProps {
    src: string;
    name: string;
    artist?: string;
    ageLimit?: number;
}

export default function SharePagePlayer({src, name, artist, ageLimit}: SharePagePlayerProps) {
    const {playTrack, currentTrack, isPlaying, isLoading, error} = useGlobalAudioPlayer();
    const isActiveTrack = currentTrack?.src === src;

    const handlePlay = () => {
        playTrack({src, name, artist, ageLimit, source: 'share'});
    };

    let status = null;
    if (isActiveTrack) {
        if (error) {
            status = (
                <div className="flex items-center justify-center gap-2 text-sm text-[var(--error-text)]" role="status">
                    <AlertCircle className="h-4 w-4" /> Playback failed. Use the player to retry.
                </div>
            );
        } else if (isLoading) {
            status = (
                <div className="flex items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]" role="status">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" /> Loading in player…
                </div>
            );
        } else if (isPlaying) {
            status = (
                <div className="flex items-center justify-center gap-2 text-sm text-[var(--foreground)]" role="status">
                    <Radio className="h-4 w-4 text-[var(--primary)]" /> Currently playing
                </div>
            );
        } else {
            status = (
                <div className="flex items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]" role="status">
                    <Pause className="h-4 w-4 text-[var(--primary)]" /> Paused in player
                </div>
            );
        }
    }

    return (
        <div className="flex min-h-20 w-full items-center justify-center border-y border-[var(--border-strong)] py-3" aria-live="polite">
            {isActiveTrack ? status : (
                <div className="flex w-full flex-col items-center gap-2 text-center">
                    <button
                        type="button"
                        onClick={handlePlay}
                        className="flex min-w-52 items-center justify-center gap-3 rounded-full bg-[var(--primary)] px-7 py-3 font-medium text-white transition-[background-color,transform] duration-200 hover:scale-[1.02] hover:bg-[var(--primary-hover)]"
                    >
                        <Play className="h-5 w-5 fill-current" /> Play this track
                    </button>
                    {currentTrack && (
                        <p className="max-w-sm text-xs text-[var(--muted-foreground)]">
                            Replaces <span className="text-[var(--foreground)]">{currentTrack.name}</span> in the player.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
