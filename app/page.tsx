import {getDirectoryContents} from '@/lib/fileSystem';
import FolderView from '@/components/FolderView';
import {Metadata} from 'next';

export const metadata: Metadata = {
    title: (process.env.DEFAULT_TITLE ? process.env.DEFAULT_TITLE + " - Home" : "Audio Archive - Home"),
    description: (process.env.DEFAULT_DESCRIPTION ? process.env.DEFAULT_DESCRIPTION : "Browse and listen to audio files")
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
    const {items, currentPath} = await getDirectoryContents();

    const directoryTitle = items.length === 1
        ? "Audio Directory"
        : "Audio Directories";

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">{directoryTitle}</h2>
            <FolderView items={items} currentPath={currentPath}/>
        </div>
    );
}