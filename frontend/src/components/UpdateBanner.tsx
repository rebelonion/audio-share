import {RefreshCw} from 'lucide-react';
import {useAppUpdate} from '@/hooks/useAppUpdate';
import SiteBanner from '@/components/ui/SiteBanner';
import {Button} from '@/components/ui/Button';

export default function UpdateBanner() {
    const updateAvailable = useAppUpdate();
    if (!updateAvailable) return null;
    return <SiteBanner aria-label="Site update" aria-live="polite"
        icon={<RefreshCw className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden="true" />}
        action={<Button size="sm" className="shrink-0" onClick={() => window.location.reload()}>Refresh now</Button>}>
        A new version is available.
    </SiteBanner>;
}
