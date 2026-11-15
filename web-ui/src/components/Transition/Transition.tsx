import { cloneElement, useCallback, useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';

type Props = {
    children: JSX.Element,
    when: boolean,
    name: string,
};

const Transition = ({ children, when, name }: Props) => {
    const [element, setElement] = useState<HTMLElement | null>(null);
    const [mounted, setMounted] = useState(false);

    const [state, setState] = useState('enter');
    const [active, setActive] = useState(false);

    const callbackRef = useCallback((element: HTMLElement | null) => {
        setElement(element);
    }, []);

    const className = useMemo(() => {
        const animationClass = `${name}-${state}`;
        const activeClass = active ? `${name}-active` : null;

        return children && classNames(
            children.props.className,
            animationClass,
            activeClass,
        );
    }, [name, state, active, children]);

    const onTransitionEnd = useCallback(() => {
        state === 'exit' && setMounted(false);
    }, [state]);

    useEffect(() => {
        setState(when ? 'enter' : 'exit');
        when && setMounted(true);
    }, [when]);

    useEffect(() => {
        requestAnimationFrame(() => {
            setActive(!!element);
        });
    }, [element]);

    useEffect(() => {
        element?.addEventListener('transitionend', onTransitionEnd);
        return () => element?.removeEventListener('transitionend', onTransitionEnd);
    }, [element, onTransitionEnd]);

    return (
        mounted && cloneElement(children, {
            ref: callbackRef,
            className,
        })
    );
};

export default Transition;
