import {describe, expect, it} from 'vitest';
import {calculateFooterClearance} from './footerClearance';

describe('calculateFooterClearance', () => {
    it('returns clearance when the footer enters the proximity zone', () => {
        expect(calculateFooterClearance(700, 900)).toBe(234);
    });

    it('keeps the default button position while the footer is below the zone', () => {
        expect(calculateFooterClearance(820, 900)).toBeNull();
        expect(calculateFooterClearance(850, 900)).toBeNull();
    });
});
