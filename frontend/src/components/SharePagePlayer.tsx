import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    AlertCircle,
    ExternalLink,
    Unlink,
    Calendar,
    Loader2
} from 'lucide-react';
import {useRef, useEffect} from 'react';
import {useAudioPlayer} from '@/hooks/useAudioPlayer';
import WaveformDisplay from '@/components/WaveformDisplay';

interface SharePagePlayerProps {
    src: string;
    onPlay?: () => void;
    unavailable?: boolean;
}

export default function SharePagePlayer({src, onPlay, unavailable}: SharePagePlayerProps) {
    const {
        isPlaying,
        duration,
        currentTime,
        volume,
        isMuted,
        error,
        thumbnail,
        metadata,
        audioLoaded,
        isLoading,
        artist,
        track,
        waveformPeaks,
        progressRef,
        togglePlay,
        toggleMute,
        handleVolumeChange,
        handleProgressClick,
        formatTime
    } = useAudioPlayer(src);

    const hasTracked = useRef(false);
    useEffect(() => { hasTracked.current = false; }, [src]);

    return (
        <div className="w-full">
            {thumbnail && (
                <div className="mb-6 flex justify-center">
                    <div className="relative w-full max-w-xs rounded-xl overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                        <img
                            src={thumbnail}
                            alt={`${metadata?.title || track} thumbnail`}
                            width={320}
                            height={320}
                            className="object-cover w-full h-auto"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                    </div>
                </div>
            )}

            {(metadata?.artist || artist) && (
                <div className="text-center mb-6">
                    <p className="text-base text-[var(--muted-foreground)]">
                        {metadata?.artist || artist}
                    </p>
                </div>
            )}

            {error && (
                <div className="mb-4 p-3 bg-red-900/20 text-red-400 rounded-lg flex items-start">
                    <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5"/>
                    <span className="text-sm">{error}</span>
                </div>
            )}

            <div className="mb-4">
                {waveformPeaks ? (
                    <WaveformDisplay
                        peaks={waveformPeaks}
                        progress={currentTime / (duration || (metadata?.duration || 1))}
                        onClick={handleProgressClick}
                        progressRef={progressRef}
                        height={56}
                        className="mb-3"
                    />
                ) : (
                    <div
                        ref={progressRef}
                        className="w-full h-3 bg-[var(--muted)] rounded-full overflow-hidden cursor-pointer transition-all duration-200 hover:h-4 mb-3"
                        onClick={handleProgressClick}
                    >
                        <div
                            className="h-full bg-[var(--primary)] rounded-full transition-all duration-100"
                            style={{
                                width: `${(currentTime / (duration || (metadata?.duration || 1))) * 100 || 0}%`,
                                opacity: audioLoaded ? 1 : 0.7
                            }}
                        ></div>
                    </div>
                )}

                <div className="flex justify-between items-center text-sm text-[var(--muted-foreground)] mb-4">
                    <span className="tabular-nums">
                        {isPlaying || currentTime > 0 ? formatTime(currentTime) : "0:00"}
                    </span>
                    <span className="tabular-nums">
                        {formatTime(duration || (metadata?.duration || 0))}
                    </span>
                </div>

                <div className="flex justify-center mb-4">
                    <button
                        onClick={() => { if (!isPlaying && onPlay && !hasTracked.current) { hasTracked.current = true; onPlay(); } togglePlay(); }}
                        className="p-4 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2"
                        aria-label={isPlaying ? "Pause" : "Play"}
                    >
                        {isLoading ? (
                            <Loader2 className="h-6 w-6 animate-spin"/>
                        ) : isPlaying ? (
                            <Pause className="h-6 w-6"/>
                        ) : (
                            <Play className="h-6 w-6 ml-0.5"/>
                        )}
                    </button>
                </div>

                <div className="flex items-center space-x-3">
                    <button
                        onClick={toggleMute}
                        className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors focus:outline-none"
                        aria-label={isMuted ? "Unmute" : "Mute"}
                    >
                        {isMuted ? <VolumeX className="h-5 w-5"/> : <Volume2 className="h-5 w-5"/>}
                    </button>

                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={handleVolumeChange}
                        className="flex-grow accent-[var(--primary)] h-2"
                        aria-label="Volume"
                    />
                </div>
            </div>

            {(metadata?.uploadDate || metadata?.webpageUrl || metadata?.description) && (
                <div className="mt-6 pt-6 border-t border-[var(--border)]">
                    {metadata?.uploadDate && (
                        <div className="text-sm text-[var(--muted-foreground)] flex items-center mb-3">
                            <Calendar className="h-4 w-4 mr-2"/>
                            <span>{`${metadata.uploadDate.substring(0, 4)}-${metadata.uploadDate.substring(4, 6)}-${metadata.uploadDate.substring(6, 8)}`}</span>
                        </div>
                    )}

                    {metadata?.webpageUrl && (
                        <div className="text-sm mb-3">
                            <a
                                href={metadata.webpageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={unavailable
                                    ? 'flex items-center text-amber-600 dark:text-amber-400 hover:text-amber-500 dark:hover:text-amber-300 transition-colors'
                                    : 'flex items-center text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors'
                                }
                            >
                                {unavailable
                                    ? <Unlink className="h-4 w-4 mr-2 flex-shrink-0"/>
                                    : <ExternalLink className="h-4 w-4 mr-2 flex-shrink-0"/>
                                }
                                <span>{unavailable ? 'The original source of this audio is no longer available.' : 'View Original Source'}</span>
                            </a>
                        </div>
                    )}

                    {metadata?.description && (
                        <div className="mt-4">
                            <h3 className="font-medium text-sm mb-2">Description</h3>
                            <p className="text-sm text-[var(--muted-foreground)] whitespace-pre-line bg-[var(--card-hover)]/20 p-3 rounded-md max-h-40 overflow-y-auto">
                                {metadata.description}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
