const baseControlClass = 'w-full min-w-0 rounded-md border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed';
export const controlClass = `${baseControlClass} bg-[var(--background)]`;
export const searchControlClass = `${baseControlClass} bg-[var(--card)]`;
export const sizes = {sm: 'px-3 py-1.5 text-sm', md: 'px-3 py-2 text-sm', lg: 'px-4 py-3 text-base'};
