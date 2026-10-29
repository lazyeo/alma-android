import {
  CirclePlay,
  CircleStop,
  CircleX,
  ClipboardList,
  FileCode,
  FilePen,
  FileSearch,
  FileText,
  Globe,
  ListChecks,
  Search,
  ScrollText,
  Slash,
  SquareTerminal,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'

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
