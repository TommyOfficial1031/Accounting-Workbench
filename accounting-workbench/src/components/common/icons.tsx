import type { ReactNode, SVGProps } from "react";

// 项目未引入图标库（AGENTS.md 允许 lucide-react，但依赖里没有安装），
// 这里用内联 SVG 保持零依赖，线宽与尺寸统一。
export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Icon({ size = 20, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10.6 12 4l8 6.6" />
      <path d="M6.2 9.8V20h11.6V9.8" />
      <path d="M10 20v-4.6h4V20" />
    </Icon>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 3h7l4.5 4.5V21h-11.5z" />
      <path d="M13.2 3v4.7h4.8" />
      <path d="M9 12.5h6M9 16h4.5" />
    </Icon>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 7.2a2 2 0 0 1 2-2h3.4l2 2h7.6a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    </Icon>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.6 11.6a8.4 8.4 0 1 0 2.4-6" />
      <path d="M3.6 4.4v4.4h4.4" />
      <path d="M12 8.4V12l2.8 1.8" />
    </Icon>
  );
}

export function CalculatorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8.5 7.5h7" />
      <path d="M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />
    </Icon>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M9.7 9.4a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1 1-1.1 1.8v.3" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7.5h10M18.5 7.5H20" />
      <path d="M4 16.5h4M12.5 16.5H20" />
      <circle cx="16" cy="7.5" r="2.4" />
      <circle cx="10" cy="16.5" r="2.4" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.5 6.5 9 12l5.5 5.5" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Icon>
  );
}

export function ImportIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 15.5V4.5" />
      <path d="M7.5 9 12 4.5 16.5 9" />
      <path d="M4.5 19.5h15" />
    </Icon>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 3.5h10L19.5 8v12.5h-14.5z" />
      <path d="M8 3.5v5h6.5v-5" />
      <path d="M8 20.5v-6h8v6" />
    </Icon>
  );
}

export function TableIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M9.5 4.5v15" />
    </Icon>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 19.5V13M9.5 19.5V6.5M15 19.5v-8M20.5 19.5V9" />
    </Icon>
  );
}

/** 导出文件管理（向下的托盘 + 箭头） */
export function ExportIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v9" />
      <path d="M8.2 9.4 12 13.2l3.8-3.8" />
      <path d="M4.5 14.5v3.2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.2" />
    </Icon>
  );
}
