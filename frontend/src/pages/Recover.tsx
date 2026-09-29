import Card from '@/components/ui/Card';
import Alert from '@/components/ui/Alert';
import {Button} from '@/components/ui/Button';
import {Textarea} from '@/components/ui/Field';
import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router';
import {KeyRound, ShieldCheck} from 'lucide-react';
import {Helmet} from 'react-helmet-async';
import {recoverBrowserProfile} from '@/lib/api';
import {useLikes} from '@/contexts/LikesContext';
import {DEFAULT_TITLE} from '@/lib/config';
import {resetMatureContentClientState} from '@/lib/matureContentPreference';
import {syncRybbitIdentity} from '@/lib/rybbitIdentity';
import {useRybbit} from '@/hooks/useRybbit';

export default function Recover() {
    const {track} = useRybbit();
    const navigate = useNavigate();
    const {isLoading: isProfileLoading, refreshLikesAfterRecovery} = useLikes();
    const [key, setKey] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const fragmentKey = params.get('key');
        if (fragmentKey) {
            setKey(fragmentKey);
            window.history.replaceState({}, '', '/recover');
        }
    }, []);

    const recover = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsWorking(true);
        setError(null);
        try {
            const profileId = await recoverBrowserProfile(key.trim());
            syncRybbitIdentity(profileId);
            track('profile-recovered');
            resetMatureContentClientState();
            await refreshLikesAfterRecovery();
            navigate('/likes', {replace: true});
        } catch (recoverError) {
            setError(recoverError instanceof Error ? recoverError.message : 'Recovery failed');
        } finally {
            setIsWorking(false);
        }
    };

    return (
        <div className="max-w-xl mx-auto min-h-[60vh] flex items-center animate-slideUp">
            <Helmet><title>Recover Likes - {DEFAULT_TITLE}</title></Helmet>
            <Card padding="lg" className="w-full">
                <div className="h-12 w-12 rounded-md bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center mb-5"><ShieldCheck className="h-6 w-6" /></div>
                <h1 className="text-3xl font-bold">Recover your likes</h1>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">Enter your recovery key to use the same anonymous profile in this browser.</p>
                <form onSubmit={recover} className="mt-6">
                    <label htmlFor="recovery-key" className="block text-sm font-medium mb-2">Recovery key</label>
                    <Textarea
                        id="recovery-key"
                        value={key}
                        onChange={event => setKey(event.target.value)}
                        rows={3}
                        autoFocus
                        spellCheck={false}
                        aria-invalid={!!error}
                        aria-describedby={error ? 'recover-error' : undefined}
                        className="font-mono"
                        placeholder="asr_…"
                    />
                    {error && <Alert id="recover-error" className="mt-3">{error}</Alert>}
                    <Button type="submit" size="lg" disabled={!key.trim() || isProfileLoading || isWorking} className="mt-5 w-full">
                        <KeyRound className="h-4 w-4" /> {isWorking ? 'Recovering…' : 'Recover likes'}
                    </Button>
                </form>
            </Card>
        </div>
    );
}
