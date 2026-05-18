export default function SelectField({ label, value, options, onChange }) {
    return (
        <label className="block space-y-2">
            <span className="text-sm font-medium">{label}</span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-2xl border bg-background px-4 py-3 outline-none focus:ring-2"
            >
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </label>
    );
}