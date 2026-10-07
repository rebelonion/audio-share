import {useState} from 'react';
import {activeSeasons, isLateNight, timeOfYear, type SeasonId, type TimeOfYear} from '@/lib/seasons';

// Evaluated once per mount: a page that straddles midnight keeps its look until the next visit.
export function useSeasons(): SeasonId[] {
    return useState(activeSeasons)[0];
}

export function useLateNight(): boolean {
    return useState(isLateNight)[0];
}

export function useTimeOfYear(): TimeOfYear {
    return useState(timeOfYear)[0];
}
