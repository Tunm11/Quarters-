import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";

export type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  description?: string;
  error?: string;
  disabled?: boolean;
};

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  description,
  error,
  disabled,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      label={label}
      type={visible ? "text" : "password"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoComplete={autoComplete}
      description={description}
      error={error}
      disabled={disabled}
      required
      aria-required="true"
      spellCheck={false}
      trailing={
        <IconButton
          label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
          className="size-9"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </IconButton>
      }
    />
  );
}
