import {sceneRandom} from '../shared/scenery';

export function landmarkAt(seed: number, index: number): 'shrine' | 'pond' | 'grove' {
    if (index === 0) return 'shrine';
    const choice = sceneRandom(seed, index * 7 + 2100);
    const previous = sceneRandom(seed, (index - 1) * 7 + 2100);
    if (choice < 0.34 && previous >= 0.34 && index !== 1 && index !== -1) return 'shrine';
    return choice < 0.7 ? 'pond' : 'grove';
}
