import React from 'react';
import {formatDate, formatDuration, formatFileSize} from '@/lib/utils';
import ItemActions, {type ItemActionsProps} from '@/components/ItemActions';

function MobileItemDetails(props: ItemActionsProps) {
    const {item} = props;
    const metadata = [
        item.type === 'audio' ? formatFileSize(item.size) : item.size ? formatFileSize(item.size) : null,
        item.type === 'folder' && item.metadata?.items ? `${item.metadata.items} items` : null,
        item.type === 'audio' && item.durationSeconds ? formatDuration(item.durationSeconds) : null,
        formatDate(item.modifiedAt),
    ].filter((value): value is string => Boolean(value));
    const detailsClass = item.type === 'audio'
        ? 'px-3 pb-3'
        : item.metadata?.original_url
            ? 'px-3 pb-2'
            : 'flex h-12 items-center px-3 pb-3';

    return (
        <div className={detailsClass}>
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap text-xs tabular-nums text-[var(--muted-foreground)]">
                {metadata.map((value, index) => (
                    <React.Fragment key={`${value}-${index}`}>
                        {index > 0 && (
                            <span aria-hidden="true" className="text-[var(--border)]">•</span>
                        )}
                        <span>{value}</span>
                    </React.Fragment>
                ))}
            </div>

            {(item.type === 'audio' || item.metadata?.original_url) && (
                <div className={item.type === 'audio' ? '-mx-3 mt-2 border-t border-[var(--border-subtle)] px-1 pt-2' : 'mt-1'}>
                    <ItemActions {...props} mobile />
                </div>
            )}
        </div>
    );
}

export default React.memo(MobileItemDetails);
