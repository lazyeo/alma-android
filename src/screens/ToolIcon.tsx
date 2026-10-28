import {
  SquareTerminal,
  ScrollText,
  CircleX,
  Globe,
  Search,
  ListChecks,
  ClipboardList,
  CirclePlay,
  CircleStop,
  Zap,
  Slash,
  Wrench,
  FilePen,
  FileCode,
  FileText,
  FileSearch,
  type LucideIcon,
} from 'lucide-react'
// Verified against Desktop App-Bz3jKXJK.js TOOL_ICON_MAP.
const icons: Record<string, LucideIcon> = {
  Bash: SquareTerminal,
  BashOutput: ScrollText,
  KillShell: CircleX,
  WebFetch: Globe,
  WebSearch: Search,
  Task: ListChecks,
  TodoWrite: ClipboardList,
  EnterPlanMode: CirclePlay,
  ExitPlanMode: CircleStop,
  Skill: Zap,
  SlashCommand: Slash,
  ToolSearch: Wrench,
  Write: FilePen,
  Edit: FilePen,
  NotebookEdit: FileCode,
  Read: FileText,
  Glob: FileSearch,
  Grep: Search,
}
export function ToolIcon({ name }: { name: string }) {
  const Icon = icons[name] ?? Wrench
  return <Icon size={16} aria-hidden="true" />
}
