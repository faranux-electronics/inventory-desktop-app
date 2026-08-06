/**
 * Resizer Component
 * A reusable drag-to-resize divider component.
 */
class Resizer {
    /**
     * Render the HTML string for the resizer element
     * @param {Object} options
     * @param {string} [options.id] - The ID for the resizer element
     * @param {string} [options.className] - Additional classes
     * @param {string} [options.orientation='vertical'] - 'vertical' (drags left/right) or 'horizontal' (drags up/down)
     */
    static render({ id = '', className = '', orientation = 'vertical' } = {}) {
        const idAttr = id ? ` id="${id}"` : '';
        const extraClass = className ? ` ${className}` : '';
        const orientClass = orientation === 'horizontal' ? ' ui-resizer-horizontal' : ' ui-resizer-vertical';
        return `
            <div${idAttr} class="ui-resizer${orientClass}${extraClass}" title="Drag to resize">
                <div class="ui-resizer-grip"><span></span><span></span><span></span></div>
            </div>
        `;
    }

    /**
     * Initialize the resize logic
     * @param {Object} options
     * @param {HTMLElement|string} options.resizer - The resizer element or ID
     * @param {HTMLElement|string} options.target - The target element to resize
     * @param {HTMLElement|string} options.container - The parent container element
     * @param {number} [options.minSize=0] - Minimum size in pixels
     * @param {number|function} [options.maxSize] - Maximum size in pixels OR a function that returns max size
     * @param {string} [options.defaultFlex] - Default flex basis (e.g., '50%') on double click
     * @param {string} [options.orientation='vertical'] - 'vertical' (resizes width) or 'horizontal' (resizes height)
     * @param {function} [options.onResize] - Callback fired on resize with new size
     */
    static init(options) {
        let {
            resizer, target, container,
            minSize = 0,
            maxSize,
            defaultFlex,
            orientation = 'vertical',
            reverse = false,
            onResize
        } = options;

        if (typeof resizer === 'string') resizer = document.getElementById(resizer);
        if (typeof target === 'string') target = document.getElementById(target);
        if (typeof container === 'string') container = document.getElementById(container);

        if (!resizer || !target || !container) return;

        let dragging = false;
        let startPos = 0, startSize = 0, activePointerId = null;
        const isVert = orientation === 'vertical';

        const onPointerMove = (moveEvent) => {
            if (!dragging) return;
            const delta = isVert ? moveEvent.clientX - startPos : moveEvent.clientY - startPos;
            let newSize = startSize + (reverse ? -delta : delta);
            
            if (minSize !== undefined) newSize = Math.max(newSize, minSize);
            
            let currentMax = typeof maxSize === 'function' ? maxSize() : maxSize;
            if (currentMax === undefined && container) {
                currentMax = isVert 
                    ? container.getBoundingClientRect().width - resizer.offsetWidth 
                    : container.getBoundingClientRect().height - resizer.offsetHeight;
            }

            if (currentMax !== undefined) newSize = Math.min(newSize, currentMax);

            target.style.flex = `0 0 ${newSize}px`;
            if (onResize) onResize(newSize);
        };

        const onPointerUp = () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            resizer.classList.remove('ui-resizer--active');
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            if (activePointerId !== null && resizer.releasePointerCapture) {
                resizer.releasePointerCapture(activePointerId);
            }
            activePointerId = null;
        };

        resizer.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return; // Only left click
            dragging = true;
            activePointerId = e.pointerId;
            startPos = isVert ? e.clientX : e.clientY;
            startSize = target.getBoundingClientRect()[isVert ? 'width' : 'height'];
            
            document.body.style.cursor = isVert ? 'col-resize' : 'row-resize';
            document.body.style.userSelect = 'none';
            resizer.classList.add('ui-resizer--active');
            
            if (resizer.setPointerCapture) {
                resizer.setPointerCapture(activePointerId);
            }
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        }, { passive: false });

        if (defaultFlex) {
            resizer.addEventListener('dblclick', () => {
                target.style.flex = `1 1 ${defaultFlex}`;
            });
        }
    }
}

module.exports = Resizer;
