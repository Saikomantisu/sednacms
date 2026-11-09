import { Select } from '@base-ui/react/select';

type Option = { value: string; label: string };

/** Shared presentation for filters and field choices. Values stay strings at the UI boundary. */
export function SelectControl({
  id,
  value,
  options,
  disabled,
  onValueChange,
}: {
  id: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select.Root
      value={value}
      items={options}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
    >
      <Select.Trigger id={id} className="select-trigger">
        <Select.Value />
        <Select.Icon className="select-icon">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m7 10 5 5 5-5" />
          </svg>
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className="select-positioner"
          sideOffset={6}
          align="start"
          alignItemWithTrigger={false}
        >
          <Select.Popup className="select-popup">
            <Select.List className="select-list">
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value} className="select-item">
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="select-indicator">✓</Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
