/**
 * Button - Reusable button component with multiple variants
 * 
 * Variants:
 * - 'primary': Solid gradient background (default)
 * - 'outlined': Outlined with border, white background
 * - 'ghost': Transparent background, minimal styling
 * 
 * Sizes:
 * - 'sm': Small (default)
 * - 'md': Medium
 * - 'lg': Large
 */
class Button {
    static create({ 
        text = '', 
        icon = '', 
        variant = 'primary', 
        size = 'sm', 
        id = '', 
        className = '', 
        title = '',
        disabled = false,
        onClick = null 
    } = {}) {
        const sizeStyles = {
            sm: 'padding: 6px 10px; font-size: 11px;',
            md: 'padding: 8px 14px; font-size: 12px;',
            lg: 'padding: 10px 16px; font-size: 13px;'
        };

        const variantStyles = {
            primary: `
                background: linear-gradient(135deg, #243B53 0%, #1E3A5F 100%);
                color: #FFFFFF;
                border: none;
                box-shadow: 0 2px 6px rgba(36, 59, 83, 0.25);
            `,
            outlined: `
                background: #FFFFFF;
                color: #243B53;
                border: 1px solid #E2E8F0;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
            `,
            ghost: `
                background: transparent;
                color: #243B53;
                border: 1px solid transparent;
                box-shadow: none;
            `
        };

        const disabledStyle = disabled ? 'opacity: 0.5; cursor: not-allowed;' : 'cursor: pointer;';

        const baseStyle = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            border-radius: 7px;
            font-weight: 700;
            letter-spacing: 0.3px;
            transition: all 0.15s ease;
            white-space: nowrap;
            ${sizeStyles[size] || sizeStyles.sm}
            ${variantStyles[variant] || variantStyles.primary}
            ${disabledStyle}
        `;

        const extraClasses = className ? ` ${className}` : '';
        const idAttr = id ? ` id="${id}"` : '';
        const titleAttr = title ? ` title="${title}"` : '';
        const disabledAttr = disabled ? ' disabled' : '';

        const buttonHtml = `
            <button${idAttr}${titleAttr}${disabledAttr} 
                class="btn-component${extraClasses}" 
                style="${baseStyle}"
                ${onClick ? `onclick="${onClick}"` : ''}>
                ${icon}
                ${text}
            </button>
        `;

        return buttonHtml;
    }
}

module.exports = Button;
