import React from 'react';
import ItemActions, {type ItemActionsProps} from '@/components/ItemActions';

function DesktopItemActions(props: ItemActionsProps) {
    return <td className="px-4 py-4 whitespace-nowrap text-sm text-right" style={{width: '20%'}}>
        <ItemActions {...props} />
    </td>;
}

export default React.memo(DesktopItemActions);
