import { DateInput, Field, Select } from "./form-controls.js";

export type DateRangePresetOption = {
  label: string;
  value: string;
};

export function DateRangePicker({
  from,
  idPrefix = "dateRange",
  onChange,
  onPresetChange,
  preset,
  presets,
  to,
}: {
  from: string;
  idPrefix?: string;
  onChange: (range: { from: string; to: string }) => void;
  onPresetChange: (preset: string) => void;
  preset: string;
  presets: DateRangePresetOption[];
  to: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field htmlFor={`${idPrefix}Preset`} label="Period">
        <Select
          id={`${idPrefix}Preset`}
          value={preset}
          onChange={(event) => onPresetChange(event.target.value)}
        >
          {presets.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field htmlFor={`${idPrefix}From`} label="From">
        <DateInput
          id={`${idPrefix}From`}
          value={from}
          onChange={(event) => onChange({ from: event.target.value, to })}
        />
      </Field>
      <Field htmlFor={`${idPrefix}To`} label="To">
        <DateInput
          id={`${idPrefix}To`}
          value={to}
          onChange={(event) => onChange({ from, to: event.target.value })}
        />
      </Field>
    </div>
  );
}
