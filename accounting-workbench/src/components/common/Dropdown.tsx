import { useState } from "react";
import styles from "./Dropdown.module.css";

export interface DropdownItem {
  value: string;
  label: string;
  disabled?: boolean;
  title?: string;
}

interface DropdownProps {
  items: DropdownItem[];
  onSelect: (value: string) => void;
  triggerLabel: string;
  selectedValue?: string;
  disabled?: boolean;
}

function Dropdown({ items, onSelect, triggerLabel, selectedValue, disabled }: DropdownProps) {
  const [open, setOpen] = useState(false);

  function handleSelect(value: string): void {
    onSelect(value);
    setOpen(false);
  }

  return (
    <div className={styles.dropdown}>
      <button
        type="button"
        className={styles.trigger}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        {triggerLabel}
      </button>
      {open && (
        <ul className={styles.menu}>
          {items.map((item) => (
            <li key={item.value}>
              <button
                type="button"
                className={styles.item}
                disabled={item.disabled}
                title={item.title}
                onClick={() => handleSelect(item.value)}
              >
                <span>{item.label}</span>
                {selectedValue === item.value && <span>✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Dropdown;
