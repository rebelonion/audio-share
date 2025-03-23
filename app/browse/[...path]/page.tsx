import {getDirectoryContents} from '@/lib/fileSystem';
import Breadcrumb from '@/components/Breadcrumb';
import FolderView from '@/components/FolderView';
import {Metadata} from 'next';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({
                                           params
                                       }: {
    params: Promise<{ path: string[] }>
}): Promise<Metadata> {
    const {path} = await params;
    const pathStr = path ? path.join('/') : '';
    const pathSegments = pathStr.split('/').filter(Boolean);
    const folderName = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : 'Root';

    return {
        title: `${folderName} - Audio Browser`,
        description: `Browse ${folderName} audio files and folders`,
    };
}

export default async function BrowsePage({
                                             params
                                         }: {
    params: Promise<{ path: string[] }>
}) {
    const {path} = await params;
    const pathStr = path ? path.join('/') : '';
    const {items, currentPath} = await getDirectoryContents(pathStr);

    const pathSegments = currentPath.split('/').filter(Boolean);
    const folderName = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : 'Root';

    return (
        <div>
            <Breadcrumb path={currentPath}/>
            <h2 className="text-2xl font-bold mb-6">{folderName}</h2>
            <FolderView items={items} currentPath={currentPath}/>
        </div>
    );
}