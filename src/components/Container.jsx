import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeProvider, useTheme } from '@contexts/ThemeContext';
import { useGeniePortal } from './Genie';
import { getBackgroundClass, STATUS_COLORS } from './Page';

// Borders that can be dragged to resize a Container or Card (`resizable`: true or 'both', 'horizontal', 'vertical'),
// from any edge or corner: the edge pulled moves and the one across from it stays where it is. The pointer is caught
// right on the border and just outside it, never inside, so a scrollbar inside keeps working. Nothing ever overlaps,
// and a part that is not resizable itself is never made smaller: the parts beside a resized one are only rearranged
// by the parent's layout (wrapped, moved to the next grid row). Where there is no room, a resizable part beside it
// gives some of its own, then a resizable parent grows to make room (and its parent, and so on); otherwise the drag
// stops there. Pulled in from the left or top it leaves a gap; pulled out that way it takes the gap back first. In a
// grid it takes whole columns. A double click on the border, or Escape while dragging, gives the size back.
const EDGE_INSIDE = 2;
const EDGE_OUTSIDE = 7;
const LEAST = { x: 48, y: 32 };
const EDGE_CURSORS = { e: 'ew', w: 'ew', n: 'ns', s: 'ns', ne: 'nesw', sw: 'nesw', nw: 'nwse', se: 'nwse' };
let edgeOwner = null;

const px = (value) => parseFloat(value) || 0;
const layoutOf = (element) => {
    const parent = element?.parentElement;
    if (!parent) return { kind: 'block' };
    const style = window.getComputedStyle(parent);
    if (style.display.includes('grid')) {
        const columns = style.gridTemplateColumns.split(' ').filter(Boolean).length || 1;
        const gap = px(style.columnGap);
        const box = parent.getBoundingClientRect();
        const width = parent.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
        return { kind: 'grid', columns, gap, left: box.left + px(style.paddingLeft), column: (width - gap * (columns - 1)) / columns };
    }
    if (style.display.includes('flex')) return { kind: style.flexDirection.startsWith('column') ? 'column' : 'row', wrap: style.flexWrap !== 'nowrap' };
    return { kind: 'block' };
};
// Whether a part can be resized that way (set by this hook on every resizable part).
const resizableOn = (part, axis) => Boolean(part?.getAttribute?.('data-resizable')?.includes(axis));
// The other parts that share the parent's line with this one, in the order they stand.
const linePartsOf = (element) => [...(element.parentElement?.children || [])].filter((part) => part !== element && part.getBoundingClientRect().width > 0 && window.getComputedStyle(part).position !== 'absolute' && window.getComputedStyle(part).position !== 'fixed');
// The most room this part can take on one axis without overlapping or squeezing anything: what its parent holds, less
// what the parts sharing its line (a single-line flex row, or a flex column) take. Infinity where the parent grows by
// itself (an automatic height), so the page is rearranged instead.
const roomOf = (element, axis) => {
    const parent = element.parentElement;
    if (!parent) return Infinity;
    const style = window.getComputedStyle(parent);
    // A floating parent (a Genie's frame) is as big as what it holds, so it never limits it.
    if (style.position === 'absolute' || style.position === 'fixed') return Infinity;
    const own = window.getComputedStyle(element);
    const layout = layoutOf(element);
    if (axis === 'x') {
        const inside = parent.clientWidth - px(style.paddingLeft) - px(style.paddingRight) - px(own.marginLeft) - px(own.marginRight);
        if (layout.kind === 'row' && !layout.wrap) {
            const others = linePartsOf(element);
            const taken = others.reduce((sum, part) => { const s = window.getComputedStyle(part); return sum + part.getBoundingClientRect().width + px(s.marginLeft) + px(s.marginRight); }, 0);
            return inside - taken - px(style.columnGap) * others.length;
        }
        return inside;
    }
    const fixed = (parent.style.height && parent.style.height !== 'auto') || style.maxHeight !== 'none' || ['auto', 'scroll', 'hidden'].includes(style.overflowY);
    if (!fixed) return Infinity;
    const inside = parent.clientHeight - px(style.paddingTop) - px(style.paddingBottom) - px(own.marginTop) - px(own.marginBottom);
    if (layout.kind === 'column' && !layout.wrap) {
        const others = linePartsOf(element);
        const taken = others.reduce((sum, part) => { const s = window.getComputedStyle(part); return sum + part.getBoundingClientRect().height + px(s.marginTop) + px(s.marginBottom); }, 0);
        return inside - taken - px(style.rowGap) * others.length;
    }
    return inside;
};
// The part beside this one on a side ('before' or 'after') of an axis, when it shares the line and can give room.
const besideOf = (element, axis, side) => {
    const box = element.getBoundingClientRect();
    const part = side === 'before' ? element.previousElementSibling : element.nextElementSibling;
    if (!part || !resizableOn(part, axis)) return null;
    const near = part.getBoundingClientRect();
    const sameLine = axis === 'x'
        ? (side === 'before' ? near.right <= box.left + 1 : near.left >= box.right - 1) && near.bottom > box.top && near.top < box.bottom
        : (side === 'before' ? near.bottom <= box.top + 1 : near.top >= box.bottom - 1) && near.right > box.left && near.left < box.right;
    if (!sameLine) return null;
    const start = axis === 'x' ? near.width : near.height;
    return { part, start, spare: Math.max(0, start - LEAST[axis]) };
};
// Asks the parent to be this big on one axis, when it is resizable that way; gives back the size it took.
const askParent = (element, axis, size) => (resizableOn(element.parentElement, axis) && element.parentElement.resizeTo ? element.parentElement.resizeTo(axis, size) : null);

export const useResizable = (resizable, elementRef, onResize = null) => {
    const axes = resizable === true || resizable === 'both' ? ['x', 'y'] : resizable === 'horizontal' ? ['x'] : resizable === 'vertical' ? ['y'] : [];
    const [size, setSize] = useState(null);
    const sizeRef = useRef(null);
    sizeRef.current = size;
    const reportRef = useRef(onResize);
    reportRef.current = onResize;
    const on = axes.length > 0;
    const sideways = axes.includes('x');
    const upright = axes.includes('y');

    useEffect(() => {
        const element = elementRef.current;
        if (!on || !element) return undefined;
        let edge = null;
        let drag = null;
        // What a drag changed on the resizable parts beside it, so giving the size back puts them back too.
        const borrowed = new Map();
        const lend = (beside, axis, left) => {
            if (!borrowed.has(beside.part)) borrowed.set(beside.part, { flex: beside.part.style.flex, width: beside.part.style.width, height: beside.part.style.height });
            const flexed = ['row', 'column'].includes(layoutOf(element).kind) && (layoutOf(element).kind === 'row') === (axis === 'x');
            Object.assign(beside.part.style, axis === 'x' ? { width: `${left}px`, ...(flexed ? { flex: `0 0 ${left}px` } : {}) } : { height: `${left}px`, ...(flexed ? { flex: `0 0 ${left}px` } : {}) });
        };
        const putBack = () => {
            borrowed.forEach((was, part) => Object.assign(part.style, was));
            borrowed.clear();
        };
        // The size this part takes on an axis, written the way its parent's layout reads it.
        const sized = (now, axis, value, layout) => {
            const next = { ...now, layout: layout.kind };
            if (axis === 'x') {
                next.width = value;
                if (layout.kind === 'grid') {
                    const span = Math.max(1, Math.min(layout.columns, Math.round((value + layout.gap) / (layout.column + layout.gap))));
                    next.gridColumn = `span ${span}`;
                }
            } else next.height = value;
            return next;
        };

        // A resizable part is asked by a child to be a given size on one axis: it takes what its own room allows,
        // asking its own parent for more, and gives back what it took.
        element.resizeTo = (axis, wanted) => {
            const box = element.getBoundingClientRect();
            const current = axis === 'x' ? box.width : box.height;
            const room = roomOf(element, axis);
            let granted = Math.min(wanted, Math.max(current, room === Infinity ? wanted : room));
            if (granted < wanted && resizableOn(element.parentElement, axis)) {
                const parentBox = element.parentElement.getBoundingClientRect();
                const took = askParent(element, axis, (axis === 'x' ? parentBox.width : parentBox.height) + (wanted - granted));
                if (took) granted = Math.min(wanted, granted + Math.max(0, took - (axis === 'x' ? parentBox.width : parentBox.height)));
            }
            setSize((now) => sized(now || {}, axis, Math.round(granted), layoutOf(element)));
            return granted;
        };

        const edgeAt = (x, y) => {
            const box = element.getBoundingClientRect();
            const near = (value, line) => value >= line - EDGE_OUTSIDE && value <= line + EDGE_OUTSIDE;
            const across = x >= box.left - EDGE_OUTSIDE && x <= box.right + EDGE_OUTSIDE && y >= box.top - EDGE_OUTSIDE && y <= box.bottom + EDGE_OUTSIDE;
            if (!across) return null;
            // Only on the border and outside it: the strip inside, where a scrollbar lives, is left alone.
            const w = sideways && near(x, box.left) && x <= box.left + EDGE_INSIDE;
            const e = sideways && near(x, box.right) && x >= box.right - EDGE_INSIDE;
            const n = upright && near(y, box.top) && y <= box.top + EDGE_INSIDE;
            const s = upright && near(y, box.bottom) && y >= box.bottom - EDGE_INSIDE;
            return `${n ? 'n' : s ? 's' : ''}${w ? 'w' : e ? 'e' : ''}` || null;
        };
        const show = (next) => {
            if (next === edge) return;
            edge = next;
            if (next) {
                element.setAttribute('data-resize-edge', next);
                edgeOwner = element;
                document.body.setAttribute('data-resize-cursor', EDGE_CURSORS[next]);
            } else {
                element.removeAttribute('data-resize-edge');
                if (edgeOwner === element) {
                    edgeOwner = null;
                    document.body.removeAttribute('data-resize-cursor');
                }
            }
        };
        const hover = (event) => {
            if (drag || (edgeOwner && edgeOwner !== element && edgeOwner.isConnected)) return;
            show(edgeAt(event.clientX, event.clientY));
        };

        // Pulled outward on the far side (right or bottom): the room there, then a resizable part after it, then a
        // resizable parent. Pulled outward on the near side (left or top): the gap left earlier, then a resizable part
        // before it. Pulled inward on the near side, a gap is left so the far edge stays.
        const along = (axis, wanted) => {
            const near = axis === 'x' ? drag.edge.includes('w') : drag.edge.includes('n');
            const start = drag.start[axis];
            if (!near) {
                let reach = Math.max(start, drag.room[axis]);
                if (wanted > reach && drag.after[axis]) {
                    const given = Math.min(wanted - reach, drag.after[axis].spare);
                    lend(drag.after[axis], axis, drag.after[axis].start - given);
                    reach += given;
                }
                if (wanted > reach && drag.parentStart[axis] !== null) {
                    const took = askParent(element, axis, drag.parentStart[axis] + (wanted - reach));
                    if (took) reach += Math.max(0, took - drag.parentStart[axis]);
                }
                return { value: Math.min(wanted, reach) };
            }
            const margin = drag.margin[axis];
            const grow = wanted - start;
            if (grow <= 0) return { value: wanted, margin: margin - grow };
            const fromGap = Math.min(grow, margin);
            let given = 0;
            if (grow > fromGap && drag.prior[axis]) {
                given = Math.min(grow - fromGap, drag.prior[axis].spare);
                lend(drag.prior[axis], axis, drag.prior[axis].start - given);
            }
            return { value: start + fromGap + given, margin: margin - fromGap };
        };
        // Every resized part stays inside the window: never past its sides, and a floating one (a Genie's card) never
        // past its top or bottom either; a part in the page may grow downward, since the page scrolls.
        const MARGIN = 8;
        const windowLimit = (axis) => {
            const box = drag.box;
            if (axis === 'x') return drag.edge.includes('w') ? box.right - MARGIN : window.innerWidth - box.left - MARGIN;
            if (!drag.floating) return drag.edge.includes('n') ? box.bottom + window.scrollY - MARGIN : Infinity;
            return drag.edge.includes('n') ? box.bottom - MARGIN : window.innerHeight - box.top - MARGIN;
        };
        const move = (event) => {
            if (!drag) return;
            let next = { ...drag.from };
            if (drag.edge.includes('e') || drag.edge.includes('w')) {
                const wanted = Math.min(windowLimit('x'), Math.max(LEAST.x, Math.round(drag.start.x + (drag.edge.includes('e') ? 1 : -1) * (event.clientX - drag.x))));
                if (drag.layout.kind === 'grid') {
                    const span = Math.max(1, Math.min(drag.layout.columns, Math.round((wanted + drag.layout.gap) / (drag.layout.column + drag.layout.gap))));
                    const end = drag.column + drag.span - 1;
                    next = { ...next, layout: 'grid', width: wanted, gridColumn: drag.edge.includes('e') ? `${drag.column} / span ${Math.min(span, drag.layout.columns - drag.column + 1)}` : `${Math.max(1, end - span + 1)} / ${end + 1}` };
                } else {
                    const placed = along('x', wanted);
                    next = sized(next, 'x', Math.round(placed.value), drag.layout);
                    if (placed.margin !== undefined) next.marginLeft = placed.margin;
                }
            }
            if (drag.edge.includes('n') || drag.edge.includes('s')) {
                const wanted = Math.min(windowLimit('y'), Math.max(LEAST.y, Math.round(drag.start.y + (drag.edge.includes('s') ? 1 : -1) * (event.clientY - drag.y))));
                const placed = along('y', wanted);
                next = sized(next, 'y', Math.round(placed.value), drag.layout);
                if (placed.margin !== undefined) next.marginTop = placed.margin;
            }
            setSize(next);
        };
        const stop = (event) => {
            const ended = drag;
            drag = null;
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', stop, true);
            window.removeEventListener('keydown', escape, true);
            document.body.removeAttribute('data-resizing');
            if (event?.type === 'keydown' && ended) {
                setSize(ended.saved);
                if (!ended.saved) putBack();
            } else reportRef.current?.(sizeRef.current);
            // The click that ends a drag is not a click on whatever is under it (a Genie would close). It comes straight
            // after the pointer is let go, if at all, so the guard lasts only until then.
            const swallow = (click) => { click.stopPropagation(); click.preventDefault(); };
            window.addEventListener('click', swallow, { capture: true, once: true });
            setTimeout(() => window.removeEventListener('click', swallow, true), 0);
        };
        const escape = (key) => { if (key.key === 'Escape') { key.stopPropagation(); stop(key); } };
        const start = (event) => {
            if (!edge || (event.button !== undefined && event.button !== 0)) return;
            event.preventDefault();
            event.stopPropagation();
            const box = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            const layout = layoutOf(element);
            const now = sizeRef.current || {};
            const parentBox = element.parentElement?.getBoundingClientRect();
            const grows = (axis) => (resizableOn(element.parentElement, axis) ? (axis === 'x' ? parentBox.width : parentBox.height) : null);
            const parentStyle = element.parentElement ? window.getComputedStyle(element.parentElement) : null;
            drag = {
                edge, layout, x: event.clientX, y: event.clientY, saved: sizeRef.current, from: now, box,
                floating: ['absolute', 'fixed'].includes(parentStyle?.position) || ['absolute', 'fixed'].includes(style.position),
                start: { x: box.width, y: box.height },
                room: { x: roomOf(element, 'x'), y: roomOf(element, 'y') },
                margin: { x: Math.max(0, now.marginLeft ?? px(style.marginLeft)), y: Math.max(0, now.marginTop ?? px(style.marginTop)) },
                prior: { x: besideOf(element, 'x', 'before'), y: besideOf(element, 'y', 'before') },
                after: { x: besideOf(element, 'x', 'after'), y: besideOf(element, 'y', 'after') },
                parentStart: { x: grows('x'), y: grows('y') },
                column: layout.kind === 'grid' ? Math.max(1, Math.round((box.left - layout.left) / (layout.column + layout.gap)) + 1) : 1,
                span: layout.kind === 'grid' ? Math.max(1, Math.round((box.width + layout.gap) / (layout.column + layout.gap))) : 1
            };
            document.body.setAttribute('data-resizing', EDGE_CURSORS[edge]);
            window.addEventListener('pointermove', move, true);
            window.addEventListener('pointerup', stop, true);
            window.addEventListener('keydown', escape, true);
        };
        const giveBack = (event) => {
            if (!edge) return;
            event.preventDefault();
            event.stopPropagation();
            putBack();
            setSize(null);
            reportRef.current?.(null);
        };
        document.addEventListener('pointermove', hover, { passive: true });
        document.addEventListener('pointerdown', start, true);
        document.addEventListener('dblclick', giveBack, true);
        return () => {
            show(null);
            delete element.resizeTo;
            document.removeEventListener('pointermove', hover);
            document.removeEventListener('pointerdown', start, true);
            document.removeEventListener('dblclick', giveBack, true);
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', stop, true);
            window.removeEventListener('keydown', escape, true);
        };
    }, [on, sideways, upright]);

    const style = {};
    if (size?.width !== undefined) {
        if (size.gridColumn) style.gridColumn = size.gridColumn;
        else if (size.layout === 'row') { style.flex = `0 0 ${size.width}px`; style.width = `${size.width}px`; }
        else style.width = `${size.width}px`;
        style.maxWidth = 'none';
    }
    if (size?.height !== undefined) {
        if (size.layout === 'column') style.flex = `0 0 ${size.height}px`;
        style.height = `${size.height}px`;
        style.maxHeight = 'none';
    }
    if (size?.marginLeft !== undefined) style.marginLeft = `${size.marginLeft}px`;
    if (size?.marginTop !== undefined) style.marginTop = `${size.marginTop}px`;
    return { resizeStyle: style, resizeHandles: null, resizeClass: on ? 'resizable' : '', resizeAxes: axes.join('') };
};

/**
 * Container - Enhanced layout container with Genie integration
 *
 * Enhanced Features:
 * - Full Genie positioning support
 * - Corner-aware floating card positioning
 * - Layout-aware floating card integration
 * - Automatic hover state management
 * - Built-in trigger capabilities
 * - Theme inheritance: nested components inherit theme from Container
 */
export const Container = forwardRef(({
    children,
    className = '', // Additional classes for custom styling
    layout = 'block', // 'block', 'flex', 'flex-wrap', 'flex-column', 'grid', 'multicolumn', 'positioned'
    columns = 1, // 1-6 for grid layouts, or 'auto', 'auto-sm', 'auto-lg'
    gap = 'lg', // 'none', 'xs', 'sm', 'md', 'lg', 'xl'
    padding = 'md', // 'none', 'xs', 'sm', 'md', 'lg', 'xl'
    width = null, // Custom width: string value like '100px', '50%', 'auto', etc.
    height = null, // Custom height: string value like '100px', '50%', 'auto', '90vh', etc.
    minWidth = null, // Custom minimum width
    minHeight = null, // Custom minimum height: string value like '100px', '50%', 'auto', '90vh', etc.
    maxWidth = null, // Custom maximum width
    maxHeight = null, // Custom maximum height
    overflow = null, // Overflow behavior: 'auto', 'hidden', 'scroll', 'visible'
    align = 'start', // 'start', 'center', 'end', 'stretch', 'baseline'
    justify = 'start', // 'start', 'center', 'end', 'between', 'around', 'evenly', 'wrap'
    margin = 'none', // 'auto', 'none'
    marginTop = null, // Margin top: 'none', 'xs', 'sm', 'md', 'lg', 'xl' or custom value
    marginBottom = null, // Margin bottom: 'none', 'xs', 'sm', 'md', 'lg', 'xl' or custom value
    wrap = true, // true, false (for flex layouts)
    flexFill = false, // Whether the container should fill available space in flex layouts
    span = null, // Grid item spanning inside a parent grid: 2, 3, or 'full'
    // Decorative background drawn from the theme colors (defined in Page.jsx)
    background = null, // 'grid', 'graph', 'dots', 'lines', 'diagonal', 'crosshatch', 'checker', 'hex', 'plus', 'waves', 'zigzag', 'rings', 'rays', 'aurora', 'gradient', 'glow'
    backgroundTone = 'auto', // 'auto' contrasts with backgroundColor; or 'primary', 'secondary', 'tertiary', 'neutral', 'text', 'contrast'
    backgroundIntensity = 'subtle', // 'subtle', 'medium', 'strong'
    backgroundSize = 'md', // 'sm', 'md', 'lg' - scale of the repeating pattern
    backgroundMotion = null, // 'drift', 'pulse', or 'none' to stop an animated background
    backgroundFade = 'none', // 'none', 'radial', 'radial-inverse', 'top', 'bottom', 'left', 'right', 'center'
    hoverable = false, // true adds a themed hover background + pointer cursor (for list rows, chips)
    backgroundColor = 'transparent', // 'transparent', 'background', 'surface', 'surface-alt', 'primary', 'secondary', 'tertiary' (status colors are not fills)
    theme = null, // Optional theme override for this container and its children
    justifySelf = null, // CSS justify-self property: 'auto', 'start', 'end', 'center', 'stretch'
    as: Component = 'div', // Component to render as (default: div)
    resizable = false, // true or 'both', 'horizontal', 'vertical': its borders can be dragged; the parts beside it follow the parent's layout
    onResize = null, // Called with the new size after a drag ({ width, height, span }), or null when it is given back
    // Genie integration props
    genie = null, // Genie content to show OR object with {trigger, content, position}
    genieTrigger = 'click', // 'click', 'hover', 'contextmenu'
    onGenieShow = null, // Callback when genie shows
    onGenieHide = null, // Callback when genie hides
    ...props
}, ref) => {
    const effectiveTheme = useTheme();

    // Use theme prop if provided, otherwise use effective theme from context
    const containerTheme = theme || effectiveTheme.currentTheme;

    // Helper function to convert margin and width props to CSS style
    const getCustomStyle = () => {
        const style = {};

        // Handle width
        if (width !== null) {
            style.width = width;
        }

        // Handle height
        if (height !== null) {
            style.height = height;
        }

        // Handle minWidth
        if (minWidth !== null) {
            style.minWidth = minWidth;
        }

        // Handle minHeight
        if (minHeight !== null) {
            style.minHeight = minHeight;
        }

        // Handle maxWidth
        if (maxWidth !== null) {
            style.maxWidth = maxWidth;
        }

        // Handle maxHeight
        if (maxHeight !== null) {
            style.maxHeight = maxHeight;
        }

        // Handle overflow
        if (overflow !== null) {
            style.overflow = overflow;
        }

        // Handle margin top
        if (marginTop !== null) {
            if (marginTop === 'none') {
                style.marginTop = '0';
            } else if (['xs', 'sm', 'md', 'lg', 'xl'].includes(marginTop)) {
                style.marginTop = `var(--spacing-${marginTop})`;
            } else {
                style.marginTop = marginTop;
            }
        }

        // Handle margin bottom
        if (marginBottom !== null) {
            if (marginBottom === 'none') {
                style.marginBottom = '0';
            } else if (['xs', 'sm', 'md', 'lg', 'xl'].includes(marginBottom)) {
                style.marginBottom = `var(--spacing-${marginBottom})`;
            } else {
                style.marginBottom = marginBottom;
            }
        }

        return style;
    };

    // Handle both old API (separate props) and new API (object with trigger, content, position)
    const genieConfig = useMemo(() => {
        if (!genie) return null;

        // New API: genie is an object with trigger, content, position
        if (typeof genie === 'object' && genie.content) {
            return {
                content: genie.content,
                trigger: genie.trigger || genieTrigger,
                position: genie.position || 'auto'
            };
        }

        // Old API: genie is just the content, other props are separate
        return {
            content: genie,
            trigger: genieTrigger,
            position: 'auto'
        };
    }, [genie, genieTrigger]);

    // Genie integration using simplified portal hook
    const containerRef = ref || useRef(null);
    const {triggerProps, GeniePortal} = useGeniePortal(
        genieConfig,
        containerRef,
        onGenieShow,
        onGenieHide
    );
    const {resizeStyle, resizeHandles, resizeClass, resizeAxes} = useResizable(resizable, containerRef, onResize);
    const getLayoutClass = () => {
        switch (layout) {
            case 'grid':
                return 'layout-grid';
            case 'flex':
                return 'layout-flex';
            case 'flex-column':
                return 'layout-flex-column';
            case 'multicolumn':
                return 'layout-multicolumn';
            case 'positioned':
                return 'layout-positioned';
            default:
                return 'layout-block';
        }
    };

    const getColumnsClass = () => {
        if (layout === 'grid') {
            if (typeof columns === 'string') {
                // Handle string-based column values
                return `grid-${columns}`;
            }
            if (typeof columns === 'number' && columns >= 1 && columns <= 6) {
                // Handle numeric column values
                return `grid-${columns}`;
            }
        }
        if (layout === 'multicolumn') {
            if (typeof columns === 'string' && columns === 'auto') {
                return 'columns-auto';
            }
            if (typeof columns === 'number' && columns >= 2 && columns <= 4) {
                return `columns-${columns}`;
            }
        }
        return '';
    };

    const getGapClass = () => {
        return `gap-${gap}`;
    };

    const getPaddingClass = () => {
        return `p-${padding}`;
    };

    const getMarginClass = () => {
        return `m-${margin}`;
    };

    const getAlignClass = () => {
        return `align-${align}`;
    };

    const getJustifyClass = () => {
        return `justify-${justify}`;
    };

    const getWrapClass = () => {
        if (layout === 'flex' || layout === 'flex-column') {
            return wrap ? 'flex-wrap' : 'flex-nowrap';
        }
        return '';
    };

    const getBackgroundStyle = () => {
        if (!backgroundColor || backgroundColor === 'transparent' || STATUS_COLORS.includes(backgroundColor)) {
            return {};
        }

        return {backgroundColor: `var(--${backgroundColor}-color)`};
    };

    const getJustifySelfClass = () => {
        if (justifySelf) {
            return `justify-self-${justifySelf}`;
        }
        return '';
    };

    // Add flex-fill class if the flexFill prop is true
    const flexFillClass = flexFill ? 'flex-fill' : '';

    // Grid item spanning and hover affordance
    const spanClass = span ? `grid-span-${span}` : '';
    const filled = Boolean(backgroundColor) && backgroundColor !== 'transparent' && !STATUS_COLORS.includes(backgroundColor);
    const hoverableClass = hoverable ? `container-hoverable ${filled ? 'container-filled' : ''}` : '';

    const backgroundClass = getBackgroundClass({
        background, backgroundTone, backgroundIntensity, backgroundSize, backgroundMotion, backgroundFade, backgroundColor
    });

    // Pass all props to DOM
    const domProps = props;

    // Merge background style with user style, giving precedence to backgroundColor prop
    const mergedStyle = {
        ...props.style,
        ...getBackgroundStyle(),
        ...getCustomStyle(),
        ...resizeStyle
    };

    const containerElement = (
        <Component
            ref={containerRef}
            {...domProps}
            {...triggerProps}
            style={mergedStyle}
            className={`container themed-container ${getLayoutClass()} ${getColumnsClass()} ${getGapClass()} ${getPaddingClass()} ${getAlignClass()} ${getJustifyClass()} ${getMarginClass()} ${getWrapClass()} ${getJustifySelfClass()} ${flexFillClass} ${spanClass} ${hoverableClass} ${genieConfig ? 'genie-trigger' : ''} ${backgroundClass} ${resizeClass} theme-${containerTheme} ${className}`}
            data-theme={containerTheme}
            data-theme-source={theme ? 'local' : 'inherited'}
            data-genie-position={genieConfig?.position || 'auto'}
            data-resizable={resizeAxes || undefined}

        >
            {children}
            {resizeHandles}

            {/* Genie Integration */}
            {GeniePortal}
        </Component>
    );

    // If theme prop is provided, wrap with ThemeProvider for inheritance
    if (theme) {
        return (
            <ThemeProvider theme={theme}>
                {containerElement}
            </ThemeProvider>
        );
    }

    return containerElement;
});

export default Container;
