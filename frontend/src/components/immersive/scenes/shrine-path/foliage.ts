import type {TimeOfYear} from '@/lib/seasons';

/** What the trees carry: blossom in spring, leaves, autumn color, or snow on bare branches and pine pads. */
export type Foliage = 'blossom' | 'leaf' | 'autumn' | 'snow';

export function foliageFor(season: TimeOfYear): Foliage {
    return season === 'spring' ? 'blossom' : season === 'summer' ? 'leaf' : season === 'autumn' ? 'autumn' : 'snow';
}
