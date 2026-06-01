export function Button({
    className = "",
    type = "button",
    disabled,
    onClick,
    children,
    ...props
}) {
    return (
        <button
            type={type}
            disabled={disabled}
            onClick={onClick}
            className={`inline-flex items-center justify-center rounded-xl px-4 py-2 font-medium disabled:opacity-50 ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}