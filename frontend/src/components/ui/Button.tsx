import type {ComponentProps} from 'react';
import {buttonClass, iconButtonClass, type ButtonStyleProps} from './buttonStyles';

type ButtonProps = ComponentProps<'button'> & ButtonStyleProps;

export function Button({variant, size, type = 'button', className, ...props}: ButtonProps) {
    return <button {...props} type={type} className={buttonClass({variant, size, className})} />;
}

export function IconButton({variant, size, type = 'button', className, ...props}: ButtonProps & {'aria-label': string}) {
    return <button {...props} type={type} className={iconButtonClass({variant, size, className})} />;
}
