import { Helmet } from 'react-helmet-async';
import BrowseClient from '@/components/BrowseClient';
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '@/lib/config';

export default function Home() {
    return (
        <>
            <Helmet>
                <title>{DEFAULT_TITLE} - Home</title>
                <meta name="description" content={DEFAULT_DESCRIPTION} />
            </Helmet>
            <BrowseClient showTitle={true} />
        </>
    );
}
