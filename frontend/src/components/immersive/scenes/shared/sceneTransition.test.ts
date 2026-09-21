import {expect, it} from 'vitest';
import {mixPalette, SceneTransition} from './sceneTransition';

it('blends through a flat fallback and continues from the visible mixture when data arrives', () => {
    const transition = new SceneTransition<number>(() => 40);
    transition.update(1, 'first', 118, 120, 3, 0, true);
    const start = transition.update(0, 'second', 0, 600, 3, 0, true);
    expect(start[0]).toMatchObject({data: 1, time: 118, weight: 1});
    const middle = transition.update(0, 'second', 0, 600, 3.03, 1.2, true);
    expect(middle[0].time).toBeCloseTo(119.2);
    expect(middle.map(layer => layer.weight)).toEqual([0.5, 0.5]);
    const loaded = transition.update(2, 'second', 0, 600, 3.03, 0, true);
    expect(loaded.slice(0, 2)).toEqual(middle);
    expect(loaded[2].weight).toBe(0);
    expect(transition.update(2, 'second', 1, 600, 3.06, 2.4, true))
        .toEqual([{data: 2, time: 1, duration: 600, weight: 1}]);
});

it('settles on the current track immediately with motion disabled', () => {
    const transition = new SceneTransition<number>(() => 40);
    transition.update(1, 'first', 90, 120, 2, 0, true);
    expect(transition.update(0, 'second', 0, 0, 2, 0, false))
        .toEqual([{data: 0, time: 0, duration: 0, weight: 1}]);
});

it('mixes hex and artwork HSL colors without turning a hue wrap into a different color', () => {
    expect(mixPalette([
        {palette: {sky: '#000000', light: 'hsl(350 100% 50%)'}, weight: 0.5},
        {palette: {sky: '#ffffff', light: 'hsl(10 100% 50%)'}, weight: 0.5},
    ])).toEqual({sky: 'rgb(128, 128, 128)', light: 'rgb(255, 21, 21)'});
});
