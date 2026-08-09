import { Bot, ImageIcon } from "lucide-react";
import { CustomSelect, type SelectOption } from "../ui";

export type ModelPickerOption = {
  value: string;
  label: string;
  description?: string;
  group?: string;
};

export function ModelPicker({ value, options, onChange, kind, disabled, className, menuClassName, menuPlacement = "top" }: { value: string; options: ModelPickerOption[]; onChange: (value: string) => void; kind: "image" | "prompt"; disabled?: boolean; className?: string; menuClassName?: string; menuPlacement?: "top" | "bottom" }) {
  const Icon = kind === "image" ? ImageIcon : Bot;
  const selectOptions: SelectOption[] = options.map((option) => ({ ...option, icon: <Icon size={15} />, labelNoTranslate: true, descriptionNoTranslate: true, groupNoTranslate: true }));
  return <CustomSelect value={value} options={selectOptions} onChange={onChange} disabled={disabled} ariaLabel={kind === "image" ? "选择生图模型" : "选择提示词优化模型"} className={className ?? "composer-model-select"} menuClassName={menuClassName ?? "composer-model-menu"} menuPlacement={menuPlacement} menuWidth={300} />;
}
