import {useEffect} from 'react';
import {useGlobalAudioPlayer} from '@/contexts/AudioPlayerContext';

const editableTags = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return editableTags.has(target.tagName) || target.isContentEditable;
}

interface UseAudioPlayerKeybindsOptions {
    onTogglePlay: () => void;
}

export function useAudioPlayerKeybinds({onTogglePlay}: UseAudioPlayerKeybindsOptions) {
    const {
        currentTrack,
        duration,
        metadata,
        toggleMute,
        seekBy,
        seekTo,
        adjustVolume,
    } = useGlobalAudioPlayer();

    useEffect(() => {
        if (!currentTrack) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) {
                return;
            }

            const totalDuration = duration || metadata?.duration || 0;

            switch (event.key) {
                case ' ':
                case 'k':
                case 'K':
                case 'MediaPlayPause':
                    event.preventDefault();
                    onTogglePlay();
                    break;
                case 'm':
                case 'M':
                    event.preventDefault();
                    toggleMute();
                    break;
                case 'ArrowLeft':
                    event.preventDefault();
                    seekBy(-5);
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    seekBy(5);
                    break;
                case 'j':
                case 'J':
                    event.preventDefault();
                    seekBy(-10);
                    break;
                case 'l':
                case 'L':
                    event.preventDefault();
                    seekBy(10);
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    adjustVolume(0.05);
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    adjustVolume(-0.05);
                    break;
                case 'Home':
                    event.preventDefault();
                    seekTo(0);
                    break;
                case 'End':
                    if (!totalDuration) return;
                    event.preventDefault();
                    seekTo(totalDuration);
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [adjustVolume, currentTrack, duration, metadata?.duration, onTogglePlay, seekBy, seekTo, toggleMute]);
}
