import { useEffect } from 'react';

/**
 * Locks background scrolling while mounted (used inside modals),
 * restoring the previous overflow value on unmount.
 */
export const LockBodyScroll = () => {
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    return null;
};