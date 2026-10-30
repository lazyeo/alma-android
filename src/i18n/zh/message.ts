import type { CatalogShape } from '../core'
import type { message as source } from '../en/message'

export const message: CatalogShape<typeof source> = {
  select: {
    title: '选择文本',
    actions: '选区操作',
    quote: '引用',
    mention: '提及',
    mentioning: '正在提及…',
    mentionFailed: '无法创建引用',
  },
  renderFailed: '无法显示这条消息。',
  prompt: '提示词',
  attachment: '附件',
  imageEdit: {
    title: '图片修改',
    visibleHeader: '修改请求',
    overallLabel: '整体：',
    directive:
      '附件图片上的编号标记与以上请求一一对应。请在对应区域完成每项修改。',
    sourcePathLabel: '来源：',
    note: '整体备注',
  },
  ranActions: { one: '执行了 {count} 个操作', other: '执行了 {count} 个操作' },
  sending: '发送中…',
  notSent: '未发送',
  version: '消息版本',
  workedFor: '耗时 {duration}',
  actions: {
    label: '消息操作',
    copy: '复制文本',
    select: '选择文本',
    mention: '提及消息',
    editResend: '编辑并重新发送',
    retry: '重新生成回复',
  },
  endReason: {
    length: '已达长度上限而停止',
    error: '因错误而结束',
  },
  resources: {
    label: '回复中的文件和网站',
    file: '文件',
    kind: {
      document: '{extension} 文档',
      spreadsheet: '{extension} 表格',
      presentation: '{extension} 演示文稿',
      image: '{extension} 图片',
      archive: '{extension} 压缩包',
      file: '{extension} 文件',
    },
    location: {
      temp: '临时',
      project: '项目',
      global: '全局',
      computer: '本机',
    },
  },
  reasoning: {
    thinking: '思考中',
    thought: '已思考',
    thoughtFor: '已思考 {seconds}s',
  },
  activity: {
    default: '正在跟进对话',
    thinkingFor: '思考中 {seconds}s',
    running: '正在运行 {name}',
    writing: '撰写中',
    memories: '正在检索记忆…',
    skills: '正在选择技能…',
  },
  tool: {
    runningCommand: '正在运行命令',
    file: '文件',
    search: '搜索',
    task: '任务',
    input: '输入',
  },
  todos: {
    list: '待办清单',
    done: '已完成 {done}/{total}',
    progress: '{total} 项待办已完成 {done} 项',
  },
  timeline: {
    label: '对话时间线',
    jumpToUser: '跳到你的消息：{preview}',
    jumpToReply: '跳到回复：{preview}',
    you: '你',
  },
  recipe: {
    label: '可复用任务建议',
    extractable: '「{title}」可提取为可复用任务',
    extracted: {
      one: '已从此对话提取 {count} 个对象',
      other: '已从此对话提取 {count} 个对象',
    },
    extract: '提取',
    dismiss: '忽略 {title}',
    kinds: {
      'repeatable-doc-task': '可复用任务',
      'thread-to-workflow': '对话 → 工作流',
      'mcp-pipeline': 'MCP 流程',
    },
  },
  code: {
    language: '代码',
    copy: '复制代码',
    copied: '已复制代码',
  },
}
