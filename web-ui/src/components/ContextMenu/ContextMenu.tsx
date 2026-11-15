import React, { memo, RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ContextMenu.less';

const PADDING = 8;

type Coordinates = [number, number];
type Size = [number, number];

type Props = {
    children: React.ReactNode,
    on: RefObject<HTMLElement>[],
    autoClose: boolean,
};

const ContextMenu = ({ children, on, autoClose }: Props) => {
    const [active, setActive] = useState(false);
    const [position, setPosition] = useState<Coordinates>([0, 0]);
    const [containerSize, setContainerSize] = useState<Size>([0, 0]);

    const ref = useCallback((element: HTMLDivElement) => {
        element && setContainerSize([element.offsetWidth, element.offsetHeight]);
    }, []);

    const style = useMemo(() => {
        const [viewportWidth, viewportHeight] = [window.innerWidth, window.innerHeight];
        const [containerWidth, containerHeight] = containerSize;
        const [x, y] = position;

        const left = Math.max(
            PADDING,
            Math.min(
                x + containerWidth > viewportWidth - PADDING ? x - containerWidth : x,
                viewportWidth - containerWidth - PADDING
            )
        );

        const top = Math.max(
            PADDING,
            Math.min(
                y + containerHeight > viewportHeight - PADDING ? y - containerHeight : y,
                viewportHeight - containerHeight - PADDING
            )
        );

        return { top, left };
    }, [position, containerSize]);

    const close = () => {
        setPosition([0, 0]);
        setActive(false);
    };

    const stopPropagation = (event: React.MouseEvent | React.TouchEvent) => {
        event.stopPropagation();
    };

    const onContextMenu = (event: MouseEvent) => {
        event.preventDefault();

        setPosition([event.clientX, event.clientY]);
        setActive(true);
    };

    const handleKeyDown = useCallback((event: KeyboardEvent) => event.key === 'Escape' && close(), []);

    const onClick = useCallback(() => {
        autoClose && close();
    }, [autoClose]);

    useEffect(() => {
        on.forEach((ref) => ref.current && ref.current.addEventListener('contextmenu', onContextMenu));
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            on.forEach((ref) => ref.current && ref.current.removeEventListener('contextmenu', onContextMenu));
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [on]);

    return active && createPortal((
        <div
            className={styles['context-menu-container']}
            onMouseDown={close}
            onTouchStart={close}
        >
            <div
                ref={ref}
                className={styles['context-menu']}
                style={style}
                onMouseDown={stopPropagation}
                onTouchStart={stopPropagation}
                onClick={onClick}
            >
                {children}
            </div>
        </div>
    ), document.body);
};

export default memo(ContextMenu);
