import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkCjkFriendlyGfmStrikethrough from 'remark-cjk-friendly-gfm-strikethrough'
import remarkGfm from 'remark-gfm'

// CommonMark won't open `**` when a letter precedes it and punctuation follows
// (e.g. `是**"引号"**`), which is common in Chinese text without spaces. The
// cjk-friendly extensions relax that rule for CJK neighbours only.
export const baseRemarkPlugins = [
  remarkGfm,
  remarkCjkFriendly,
  remarkCjkFriendlyGfmStrikethrough,
]
