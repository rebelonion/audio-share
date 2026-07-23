const FOOTER_PROXIMITY_PX = 80;
const FOOTER_GAP_PX = 34;

export function calculateFooterClearance(footerTop: number, viewportHeight: number): number | null {
    return footerTop < viewportHeight - FOOTER_PROXIMITY_PX
        ? viewportHeight - footerTop + FOOTER_GAP_PX
        : null;
}
