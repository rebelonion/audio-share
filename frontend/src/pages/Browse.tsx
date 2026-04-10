import { useLocation } from 'react-router';
import { Helmet } from 'react-helmet-async';
import BrowseClient from '@/components/BrowseClient';
import { DEFAULT_DESCRIPTION } from '@/lib/config';

export default function Browse() {
    const location = useLocation();

    // Extract path from URL, e.g., /browse/folder/subfolder -> folder/subfolder
    const pathFromUrl = location.pathname.replace(/^\/browse\/?/, '');
    // Decode each segment
    const pathStr = pathFromUrl
        ? pathFromUrl.split('/').map(segment => decodeURIComponent(segment)).join('/')
        : '';

    const pathSegments = pathStr.split('/').filter(Boolean);
    const folderName = pathSegments.length > 0
        ? pathSegments[pathSegments.length - 1]
        : 'Root';

    return (
        <>
            <Helmet>
                <title>{folderName} - Audio Browser</title>
                <meta name="description" content={`${DEFAULT_DESCRIPTION} — Browse ${folderName}`} />
            </Helmet>
            <div className="max-w-7xl mx-auto animate-slideUp">
                <BrowseClient initialPath={pathStr} />
            </div>
        </>
    );
}
