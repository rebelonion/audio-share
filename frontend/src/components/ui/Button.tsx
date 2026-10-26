import type {ComponentProps} from 'react';
import {buttonClass, iconButtonClass, type ButtonStyleProps, type IconButtonStyleProps} from './buttonStyles';

type ButtonProps = ComponentProps<'button'> & ButtonStyleProps;

export function Button({variant, size, shape, type = 'button', className, ...props}: ButtonProps) {
    return <button {...props} type={type} className={buttonClass({variant, size, shape, className})} />;
}

export function IconButton({variant, size, type = 'button', className, ...props}: ComponentProps<'button'> & IconButtonStyleProps & {'aria-label': string}) {
    return <button {...props} type={type} className={iconButtonClass({variant, size, className})} />;
}
