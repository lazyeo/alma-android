/**
 * Screenshot fixture: the real app over an in-memory pairing store and a mock
 * tunnel that answers from synthetic data. No relay, desktop, or real thread
 * is contacted. Served only by the Vite dev server via
 * `scripts/screenshots/fixture.html`; the production entry never imports it.
 *
 * The route comes from `?route=` so captures are independent of the dev URL.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from '../App'
import { ThemeProvider } from '../ThemeProvider'
import { LanguageProvider } from '../i18n'
import {
  persistThreadList,
  type ManagedTunnel,
  type MessagePart,
  type MessageRow,
  type StoredPairing,
  type Thread,
} from '../relay'
import type { TunnelResponse, TunnelSocket } from '../relay/tunnel'
import { saveDraft } from '../screens/threadDrafts'
import { addQueuedMessage, saveThreadQueue } from '../screens/threadQueue'
import { installNativeInsetsBridge } from '../nativeInsets'
import { setSharePayloadForFixture } from '../share/useSharePayload'
import { closeTopOverlay } from '../overlayStack'
import '../styles.css'

installNativeInsetsBridge()
;(
  window as typeof window & { __closeTopOverlay?: () => boolean }
).__closeTopOverlay = closeTopOverlay

const DESKTOP_ID = 'fixture-desktop'
const SECOND_DESKTOP_ID = 'fixture-studio'
const THIRD_DESKTOP_ID = 'fixture-lab'
const NOW = Date.now()
const FIXTURE_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" rx="36" fill="#191d2a"/><rect x="54" y="54" width="852" height="432" rx="24" fill="#252b3d"/><circle cx="144" cy="144" r="38" fill="#8b9eff"/><path d="M94 414 298 226l132 124 124-96 312 160H94Z" fill="#6674b7"/><path d="m94 414 204-188 132 124 62-48 132 112H94Z" fill="#a9b4ff"/><text x="480" y="128" fill="#f4f5fb" font-family="system-ui,sans-serif" font-size="30" text-anchor="middle">Interface preview</text></svg>`
const SCREEN_PATTERN = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#20324a"/><stop offset="1" stop-color="#11151d"/></linearGradient></defs><rect width="1280" height="800" fill="url(#g)"/><rect x="32" y="28" width="1216" height="56" rx="16" fill="#e7e9ee"/><circle cx="70" cy="56" r="9" fill="#f06b68"/><circle cx="99" cy="56" r="9" fill="#e9bd59"/><circle cx="128" cy="56" r="9" fill="#61bd78"/><rect x="64" y="126" width="360" height="610" rx="24" fill="#f7f8fa"/><rect x="456" y="126" width="760" height="286" rx="24" fill="#dbe5f5"/><rect x="456" y="444" width="360" height="292" rx="24" fill="#dde9df"/><rect x="848" y="444" width="368" height="292" rx="24" fill="#f1dfd6"/><text x="96" y="180" fill="#1b2432" font-family="system-ui,sans-serif" font-size="28" font-weight="700">Synthetic Mac</text><text x="96" y="218" fill="#647087" font-family="system-ui,sans-serif" font-size="18">Remote screen test pattern</text><path d="M504 344 C620 176 744 376 872 214 S1080 188 1168 322" fill="none" stroke="#6c82ad" stroke-width="14" stroke-linecap="round"/><circle cx="636" cy="274" r="18" fill="#4d699c"/><circle cx="902" cy="240" r="18" fill="#4d699c"/><rect x="96" y="274" width="270" height="18" rx="9" fill="#c4cad5"/><rect x="96" y="316" width="210" height="18" rx="9" fill="#d8dce4"/><rect x="96" y="358" width="246" height="18" rx="9" fill="#d8dce4"/></svg>`
const SCREEN_JPEG = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 800
  const context = canvas.getContext('2d')!
  const image = new Image()
  image.src = `data:image/svg+xml;base64,${btoa(SCREEN_PATTERN)}`
  return new Promise<string>((resolve) => {
    image.onload = () => {
      context.drawImage(image, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1] ?? '')
    }
  })
})()
const FIXTURE_MARKDOWN = `# Markdown preview

Rendered with the same **safe Markdown** used in messages.

- [x] Preview and source tabs
- [x] Local assets through the tunnel
- [ ] Review the [linked brief](./linked-brief.md)

| Capability | Status | Notes |
| --- | --- | --- |
| Tables | Ready | Wide cells stay inside their own scroller |
| Code | Ready | Long lines never widen the document |

\`\`\`ts
const release = { channel: 'mobile', feature: 'markdown-preview', ready: true }
\`\`\`

![Interface preview](../Pictures/interface-preview.png)
`
const minutesAgo = (minutes: number) => NOW - minutes * 60_000

const pairing: StoredPairing = {
  id: DESKTOP_ID,
  name: 'Alma@MBA',
  relayUrl: 'wss://relay.invalid',
  connectCode: 'fixture-only',
  addedAt: minutesAgo(600),
  lastActiveAt: NOW,
}
const fixturePairings: StoredPairing[] = [
  pairing,
  {
    ...pairing,
    id: SECOND_DESKTOP_ID,
    name: 'Studio Mini',
    connectCode: 'fixture-studio',
    addedAt: minutesAgo(500),
  },
  {
    ...pairing,
    id: THIRD_DESKTOP_ID,
    name: 'Home Lab',
    connectCode: 'fixture-lab',
    addedAt: minutesAgo(400),
    hidden: true,
  },
]

const workspaces = [
  { id: 'ws-app', name: 'alma-mobile', path: '~/code/alma-mobile' },
  { id: 'ws-site', name: 'marketing-site', path: '~/code/marketing-site' },
  { id: 'ws-notes', name: 'Default', path: '~/Notes' },
]

const models = [
  {
    id: 'gpt-5',
    providerId: 'openai',
    providerName: 'OpenAI',
    name: 'GPT-5',
    capabilities: {
      reasoning: true,
      reasoningLevels: ['low', 'medium', 'high'],
      vision: true,
    },
  },
  {
    id: 'claude-sonnet-5-5',
    providerId: 'anthropic',
    providerName: 'Anthropic',
    name: 'Claude Sonnet 5.5',
    capabilities: { reasoning: true, vision: true },
  },
]

const text = (value: string): MessagePart => ({ type: 'text', text: value })

function row(
  threadId: string,
  index: number,
  role: 'user' | 'assistant',
  parts: MessagePart[],
  timestamp: number,
  metadata?: MessageRow['metadata'],
): MessageRow {
  const id = `m${index}`
  return {
    id: `${threadId}--${id}`,
    threadId,
    depth: index,
    message: { id, role, parts },
    timestamp,
    ...(metadata ? { metadata } : {}),
  }
}

const screenshotParams = new URLSearchParams(window.location.search)
const screenshotLanguage = screenshotParams.get('lang')
if (screenshotLanguage === 'en' || screenshotLanguage === 'zh')
  localStorage.setItem('alma-mobile-language-v1', screenshotLanguage)
if (screenshotParams.get('route') === '/share') {
  const shareKind = screenshotParams.get('shareKind')
  setSharePayloadForFixture(
    shareKind === 'image'
      ? {
          files: [
            {
              name: 'fold-layout.png',
              mimeType: 'image/png',
              size: 1280,
              dataUrl:
                'data:image/svg+xml;base64,' +
                btoa(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#31394a"/><rect x="18" y="18" width="92" height="124" rx="12" fill="#788ba8"/><rect x="130" y="18" width="92" height="124" rx="12" fill="#9ab7a7"/><path d="M120 12v136" stroke="#f4f0e8" stroke-width="4"/></svg>',
                ),
            },
          ],
        }
      : {
          subject: 'Alma Mobile share target',
          text: 'https://developer.android.com/training/sharing/receive',
          files: [],
        },
  )
}
const pendingShot = screenshotParams.get('pending')
const fixtureError = screenshotParams.get('error')
const pendingTodoDone = screenshotParams.has('pendingTodoDone')
const queueCount = Math.max(
  1,
  Math.min(5, Number(screenshotParams.get('queueCount')) || 2),
)

const TOPICS = [
  [
    'Sketch the split layout breakpoints.',
    'Two panes from 720 px; the list keeps its scroll position.',
  ],
  [
    'How should Back behave on tablets?',
    'Back closes the detail pane instead of replaying history.',
  ],
  [
    'Add a context ring to the header.',
    'The ring turns amber at 60% and red at 80%.',
  ],
  [
    'Can compaction be undone?',
    'No. Desktop summarizes older turns into one message.',
  ],
  [
    'Show token usage per reply.',
    'The last reply gets an input/output/reasoning footer.',
  ],
  [
    'What about session totals?',
    'Totals accumulate from completions while the thread is open.',
  ],
  [
    'Design the timeline rail.',
    'User turns are strong markers; replies are lighter ticks. Longer content creates longer ticks so dense conversations still have a readable shape.',
  ],
  ['Crowded rails?', 'One marker per slot, preferring user turns.'],
  ['Drag behavior?', 'Dragging previews a turn; releasing jumps to it.'],
  ['Keyboard access?', 'Each marker is a button that jumps on Enter.'],
  [
    'Theme colors?',
    '| Token | Purpose | Example |\n| --- | --- | --- |\n| `--primary` | Active state | Timeline tick |\n| `--border` | Structure | Table grid |\n| `--muted` | Header fill | Column headings |',
  ],
  [
    'Code theme?',
    'Use theme tokens without a glow:\n\n```ts\nconst safeTop = Math.max(systemBars.top, cutout.top)\napplyInsets({ safeTop })\n```',
  ],
  ['Screenshots?', 'A mock tunnel serves synthetic threads.'],
] as const

function conversation(threadId: string, turns: number, startMinutes: number) {
  const rows: MessageRow[] = []
  for (let turn = 0; turn < turns; turn++) {
    const [question, answer] = TOPICS[turn % TOPICS.length]
    const at = minutesAgo(startMinutes - turn * 3)
    rows.push(row(threadId, rows.length, 'user', [text(question)], at))
    rows.push(
      row(
        threadId,
        rows.length,
        'assistant',
        [
          text(
            `${answer}\n\nThis keeps the interaction **predictable** on both phones and tablets, and every state change stays inside one shared shell.`,
          ),
        ],
        at + 20_000,
      ),
    )
  }
  return rows
}

const generatingRows: MessageRow[] = [
  ...conversation('t-gen', 2, 30),
  row(
    't-gen',
    4,
    'user',
    [text('Refactor the queue panel and run the tests.')],
    NOW - 83_000,
  ),
  row(
    't-gen',
    5,
    'assistant',
    [
      { type: 'step-start' },
      {
        type: 'tool-Task',
        toolCallId: 'call-task-running',
        state: 'input-available',
        startedAt: NOW - 12_000,
        input: {
          description: 'Polish queue panel',
          prompt: 'Refactor and test the queue panel.',
        },
      },
      {
        type: 'tool-TodoWrite',
        toolCallId: 'call-todos',
        state: 'output-available',
        input: { todos: [] },
        output: {
          todos: [
            {
              content: 'Inspect queue state',
              activeForm: 'Inspecting queue state',
              status: 'completed',
            },
            {
              content: 'Refactor queue panel',
              activeForm: 'Refactoring queue panel',
              status: 'in_progress',
            },
            {
              content: 'Run focused tests',
              activeForm: 'Running focused tests',
              status: 'pending',
            },
          ],
        },
      },
      {
        type: 'reasoning',
        text: 'The queue panel mixes layout and state. Extract the pure reorder helper first, then rerun vitest.',
        state: 'input-streaming',
      },
    ],
    NOW - 60_000,
    { endResources: [{ path: '/tmp/alma-mobile-report.md' }] },
  ),
]

const fileRows: MessageRow[] = [
  row(
    't-files',
    0,
    'assistant',
    [
      text(
        'Desktop files ready for review:\n\n- [Release brief](/home/example/Documents/release-brief.docx)\n- [Interface preview](/home/example/Pictures/interface-preview.png)\n- [Release notes](/home/example/Documents/release-notes.md)\n- [Missing export](/home/example/Documents/missing-export.zip)\n- [Launch page](/home/example/Documents/site/launch.html)\n\nInline paths stay code: `/home/example/private/token.txt`.',
      ),
    ],
    NOW - 20_000,
  ),
]

const endResourceRows: MessageRow[] = [
  row(
    't-end-resources',
    0,
    'user',
    [
      text('Please prepare the release bundle from these references.'),
      {
        type: 'image',
        url: '/api/gallery/cache/thread-files-preview.png',
        filename: 'interface-preview.png',
        mediaType: 'image/png',
      },
      {
        type: 'file',
        url: '/api/files/thread-files-brief',
        filePath: '/home/example/code/alma-mobile/release/source-brief.txt',
        filename: 'source-brief.txt',
        mediaType: 'text/plain',
      },
    ],
    NOW - 40_000,
  ),
  row(
    't-end-resources',
    1,
    'assistant',
    [
      text(
        'The exports are ready. You can also open /home/example/code/alma-mobile/release/release-brief.docx directly, or inspect `/tmp/alma-android-preview/alma-android-preview.apk`.',
      ),
      {
        type: 'tool-Write',
        toolCallId: 'write-preview-sample',
        state: 'output-available',
        input: { file_path: 'preview-samples/release-notes.md' },
        output: {
          file_path:
            '/home/example/code/alma-mobile/preview-samples/release-notes.md',
        },
      },
    ],
    NOW - 30_000,
    {
      endResources: [
        {
          type: 'file',
          path: '/tmp/alma-android-preview/alma-android-preview.apk',
        },
        {
          type: 'file',
          path: '/home/example/.config/alma/memory/2026-10-27.md',
          description: 'Today’s memory note',
        },
        {
          type: 'file',
          path: '/home/example/code/alma-mobile/release/release-brief.docx',
        },
      ],
    },
  ),
  row('t-end-resources', 2, 'assistant', [], NOW - 10_000, {
    endResources: [
      {
        type: 'file',
        path: '/home/example/code/alma-mobile/preview-samples/release-notes.md',
        description: 'File delivery',
      },
    ],
  }),
]

const completedTaskRows: MessageRow[] = [
  row(
    't-task-cards-complete',
    0,
    'user',
    [text('Summarize the accessibility review.')],
    NOW - 50_000,
  ),
  row(
    't-task-cards-complete',
    1,
    'assistant',
    [
      {
        type: 'tool-Task',
        toolCallId: 'call-task-complete',
        state: 'output-available',
        durationMs: 6_400,
        input: { description: 'Accessibility review' },
        output: {
          taskId: 'task-accessibility',
          status: 'completed',
          result:
            '## Review complete\n\n- Labels are explicit\n- Focus stays inside sheets\n- Touch targets meet the mobile baseline',
        },
      },
      text(
        'The review is complete and the remaining notes are captured above.',
      ),
    ],
    NOW - 8_000,
    {
      usage: {
        inputTokens: 1240,
        outputTokens: 386,
        totalTokens: 1626,
        reasoningTokens: 92,
        cachedInputTokens: 640,
        cacheWriteInputTokens: 0,
      },
      turnEndReason: 'length',
    },
  ),
]

const refRows: MessageRow[] = [
  row(
    't-refs',
    0,
    'user',
    [
      text(
        'Compare @[Tablet layout and timeline](alma://thread/t-long) with @[Split layout](alma://crystal/cry_layout) before we ship.',
      ),
    ],
    minutesAgo(6),
  ),
  row(
    't-refs',
    1,
    'assistant',
    [
      text(
        'The two-pane rules in @[Tablet layout and timeline](alma://thread/t-long) still hold. The @[Split layout](alma://crystal/cry_layout) crystal adds:\n\n- Back closes the detail pane\n- The list keeps its scroll position\n\nRun @[screenshot-review](alma://skill/screenshot-review) before tagging.',
      ),
    ],
    minutesAgo(5),
  ),
]

const threads: Array<Thread & { messages: MessageRow[] }> = [
  {
    id: 't-end-resources',
    title: 'Reply deliverables',
    model: 'openai:gpt-5',
    workspaceId: 'ws-app',
    metadata: { gtdStatus: 'inbox' },
    createdAt: minutesAgo(2),
    updatedAt: NOW - 10_000,
    messages: endResourceRows,
  },
  {
    id: 't-files',
    title: 'Desktop file handoff',
    model: 'openai:gpt-5',
    workspaceId: 'ws-app',
    metadata: { gtdStatus: 'inbox' },
    createdAt: minutesAgo(1),
    updatedAt: NOW - 20_000,
    messages: fileRows,
  },
  {
    id: 't-gen',
    title: 'Queue panel refactor',
    model: 'openai:gpt-5',
    workspaceId: 'ws-app',
    isGenerating: true,
    metadata: { gtdStatus: 'in_progress' },
    createdAt: minutesAgo(30),
    updatedAt: NOW - 60_000,
    messages: generatingRows,
  },
  {
    id: 't-task-cards-complete',
    title: 'Accessibility review',
    model: 'openai:gpt-5',
    workspaceId: 'ws-app',
    metadata: {
      gtdStatus: 'todo',
      autoTodo: {
        what: 'Ship the accessibility review follow-up',
        quote: 'Summarize the accessibility review.',
        at: NOW - 50_000,
      },
    },
    createdAt: minutesAgo(2),
    updatedAt: NOW - 8_000,
    messages: completedTaskRows,
  },
  {
    id: 't-refs',
    title: 'Ship review with references',
    model: 'openai:gpt-5',
    workspaceId: 'ws-app',
    metadata: { gtdStatus: 'inbox' },
    createdAt: minutesAgo(7),
    updatedAt: minutesAgo(5),
    messages: refRows,
  },
  {
    id: 't-long',
    title: 'Tablet layout and timeline',
    model: 'anthropic:claude-sonnet-5-5',
    workspaceId: 'ws-app',
    isFavorited: true,
    isFavoritePinned: true,
    favoritePinnedOrder: 2,
    createdAt: minutesAgo(120),
    updatedAt: minutesAgo(8),
    messages: conversation('t-long', 12, 90),
  },
  {
    id: 't-ctx',
    title: 'Context window budget',
    model: 'openai:gpt-5',
    workspaceId: 'ws-site',
    isFavorited: true,
    createdAt: minutesAgo(200),
    updatedAt: minutesAgo(25),
    isGenerating: Boolean(pendingShot),
    messages: pendingShot
      ? [
          ...conversation('t-ctx', 2, 60),
          row(
            't-ctx',
            4,
            'user',
            [text('Find the relevant memories and choose the best skills.')],
            NOW,
          ),
        ]
      : conversation('t-ctx', 3, 60),
  },
  {
    id: 't-name',
    title: 'New thread',
    model: 'openai:gpt-5',
    workspaceId: 'ws-notes',
    isGeneratingTitle: true,
    createdAt: minutesAgo(2),
    updatedAt: minutesAgo(2),
    messages: conversation('t-name', 1, 2),
  },
  {
    id: 't-queue',
    title: 'Release checklist',
    model: 'openai:gpt-5',
    workspaceId: 'ws-site',
    metadata: {
      gtdStatus: 'todo',
      autoTodo: {
        what: 'Confirm the store listing screenshots',
        quote: 'Release checklist',
        at: NOW - 90 * 60_000,
      },
    },
    createdAt: minutesAgo(400),
    updatedAt: minutesAgo(90),
    messages: conversation('t-queue', 2, 120),
  },
  {
    id: 't-draft',
    title: 'Pricing page copy',
    model: 'anthropic:claude-sonnet-5-5',
    workspaceId: 'ws-site',
    metadata: { gtdStatus: 'done' },
    createdAt: minutesAgo(900),
    updatedAt: minutesAgo(300),
    messages: conversation('t-draft', 2, 400),
  },
  ...Array.from({ length: 16 }, (_, index) => {
    const id = `t-scroll-${index}`
    return {
      id,
      title: `Mobile polish follow-up ${index + 1}`,
      model: 'openai:gpt-5',
      workspaceId: index % 2 ? 'ws-site' : 'ws-app',
      createdAt: minutesAgo(1_000 + index * 40),
      updatedAt: minutesAgo(340 + index * 20),
      messages: conversation(id, 1, 340 + index * 20),
    }
  }),
  // GTD: inbox rows older than 7×24h fold behind one row; one archived row.
  ...[10, 30].map((days) => ({
    id: `t-inbox-old-${days}`,
    title: `Old idea from ${days} days ago`,
    model: 'openai:gpt-5',
    workspaceId: 'ws-notes',
    metadata: { gtdStatus: 'inbox' },
    createdAt: minutesAgo(days * 1_440 + 60),
    updatedAt: minutesAgo(days * 1_440),
    messages: conversation(`t-inbox-old-${days}`, 1, days * 1_440),
  })),
  {
    id: 't-orphan-a',
    title: 'Imported thread from deleted project A',
    model: 'openai:gpt-5',
    workspaceId: 'ws-deleted-a',
    metadata: { gtdStatus: 'done' },
    createdAt: minutesAgo(2_200),
    updatedAt: minutesAgo(2_000),
    messages: conversation('t-orphan-a', 1, 2_000),
  },
  {
    id: 't-orphan-b',
    title: 'Imported thread from deleted project B',
    model: 'openai:gpt-5',
    workspaceId: 'ws-deleted-b',
    metadata: { gtdStatus: 'done' },
    createdAt: minutesAgo(2_400),
    updatedAt: minutesAgo(2_100),
    messages: conversation('t-orphan-b', 1, 2_100),
  },
  {
    id: 't-uncategorized',
    title: 'Thread without a project',
    model: 'openai:gpt-5',
    metadata: { gtdStatus: 'done' },
    createdAt: minutesAgo(2_600),
    updatedAt: minutesAgo(2_200),
    messages: conversation('t-uncategorized', 1, 2_200),
  },
  {
    id: 't-archived',
    title: 'Retired onboarding flow',
    model: 'openai:gpt-5',
    workspaceId: 'ws-app',
    metadata: { gtdStatus: 'archived' },
    createdAt: minutesAgo(60 * 1_440),
    updatedAt: minutesAgo(45 * 1_440),
    messages: conversation('t-archived', 1, 45 * 1_440),
  },
]

const contextUsage: Record<string, number> = {
  't-gen': 34,
  't-long': 58,
  't-ctx': 72,
}

function fixtureContextPercent(threadId: string) {
  const requested = Number(
    new URLSearchParams(window.location.search).get('context'),
  )
  return Number.isFinite(requested)
    ? Math.min(100, Math.max(0, requested))
    : (contextUsage[threadId] ?? 12)
}

function json(status: number, body: unknown): TunnelResponse {
  const payload = JSON.stringify(body)
  return {
    status,
    headers: { 'content-type': 'application/json' },
    text: async () => payload,
    json: async <T,>() => JSON.parse(payload) as T,
    bytes: async () => new TextEncoder().encode(payload),
  }
}

function binary(
  status: number,
  bytes: Uint8Array,
  contentType: string,
): TunnelResponse {
  return {
    status,
    headers: {
      'content-type': contentType,
      'content-length': String(bytes.byteLength),
    },
    text: async () => new TextDecoder().decode(bytes),
    json: async <T,>() => JSON.parse(new TextDecoder().decode(bytes)) as T,
    bytes: async () => bytes.slice(),
  }
}

function pendingResponse(): TunnelResponse {
  const pending = () => new Promise<never>(() => {})
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    text: pending,
    json: pending,
    bytes: pending,
  }
}

const fixtureRecipe = {
  id: 'thread-to-workflow',
  title: 'Turn this conversation into a workflow',
  description: 'Extract a reusable workflow from the current conversation.',
  slots: [
    { key: 'thread', label: 'Conversation', filled: true },
    { key: 'steps', label: 'Repeated steps', filled: true },
  ],
  extractPrompt: 'Extract this conversation into a reusable workflow.',
}
const extractedFixtureRecipe = {
  ...fixtureRecipe,
  id: 'repeatable-doc-task',
  title: 'Repeatable document and report task',
  recipeState: 'extracted',
}
const RECIPE_STATE_KEY = 'alma-fixture.recipe-state'
const recipes = {
  threadId: 't-gen',
  open: [fixtureRecipe],
  all: [fixtureRecipe, extractedFixtureRecipe],
}

const loops: Record<string, unknown> = {
  't-gen': {
    prompt: 'check whether the deploy finished',
    intervalMs: 300_000,
    startedAt: NOW - 1_200_000,
    iterations: 4,
    lastFiredAt: NOW - 300_000,
  },
}
const goals: Record<string, unknown> = {
  't-gen': {
    condition: 'Refactor the queue panel and pass all tests',
    setAt: NOW - 60_000,
    turnsEvaluated: 3,
  },
  't-long': {
    condition: 'Finish tablet layout',
    setAt: NOW - 120_000,
    turnsEvaluated: 5,
    achievedAt: NOW,
    lastReason: 'Layout checks passed.',
  },
  't-ctx': {
    condition: 'Review context usage',
    setAt: NOW - 120_000,
    turnsEvaluated: 2,
    pausedAt: NOW,
  },
}
const refKinds = [
  { kind: 'thread', label: 'Threads', prefixes: ['thread', '对话'] },
  { kind: 'crystal', label: 'Crystals', prefixes: ['crystal', '结晶'] },
  { kind: 'skill', label: 'Skills', prefixes: ['skill', '技能'] },
  { kind: 'plan', label: 'Plans', prefixes: ['plan', '计划'] },
].map((item, order) => ({ ...item, order, scope: 'global', available: true }))

const refCorpus = [
  ...threads.map((item) => ({
    uri: `alma://thread/${item.id}`,
    kind: 'thread',
    id: item.id,
    title: item.title ?? 'Untitled',
    subtitle: workspaces.find((space) => space.id === item.workspaceId)?.name,
  })),
  {
    uri: 'alma://crystal/cry_layout',
    kind: 'crystal',
    id: 'cry_layout',
    title: 'Split layout',
    subtitle: 'pattern',
  },
  {
    uri: 'alma://crystal/cry_release',
    kind: 'crystal',
    id: 'cry_release',
    title: 'Release checklist',
    subtitle: 'entity',
  },
  {
    uri: 'alma://skill/screenshot-review',
    kind: 'skill',
    id: 'screenshot-review',
    title: 'screenshot-review',
    subtitle: 'Review captured UI states',
  },
  {
    uri: 'alma://plan/tablet-pass',
    kind: 'plan',
    id: 'tablet-pass',
    title: 'Tablet polish pass',
    subtitle: '4 of 6 steps done',
  },
]

const crystal = (
  id: string,
  name: string,
  stage: string,
  type?: string,
  extra: Record<string, unknown> = {},
) => ({ id, name, stage, type, dormant: 0, updated_at: 'now', ...extra })
const crystalOverview = {
  contourCount: 35,
  slotCapacity: 3,
  slots: [
    crystal('cry_layout', 'Split layout', 'formal', 'pattern', { slot: 1 }),
    crystal('cry_release', 'Release checklist', 'candidate', 'entity', {
      slot: 2,
    }),
  ],
  backpack: [
    crystal('cry_untyped', 'Untyped candidate', 'candidate'),
    crystal('cry_theme', 'Theme variables only', 'candidate', 'pattern'),
    crystal('cry_relay', 'Relay safety model', 'candidate', 'entity', {
      dormant: 1,
    }),
    crystal('cry_ime', 'IME-safe composer', 'seed', 'pattern'),
  ],
  formal: [crystal('cry_layout', 'Split layout', 'formal', 'pattern')],
  types: ['entity', 'pattern'],
}
const checklistSpec = [
  { key: 'grounded', label: 'Grounded in two sources' },
  { key: 'named', label: 'Clear name' },
  { key: 'validated', label: 'Validated on desktop' },
]
const crystalChecklists = new Map<string, Record<string, unknown>>([
  [
    'cry_release',
    {
      grounded: {
        value: 'The release procedure is supported by both review threads.',
        sources: ['turn:release-1', 'note:m2'],
      },
      named: { value: 'Release checklist', sources: ['user:manual'] },
    },
  ],
])
const crystalDetail = (id: string) => {
  const summary = [...crystalOverview.slots, ...crystalOverview.backpack].find(
    (item) => item.id === id,
  )
  return (
    summary && {
      ...summary,
      origin: 'seed',
      materials: [
        {
          id: 'm1',
          crystal_id: id,
          kind: 'turn',
          source: 'auto',
          created_at: '2026-10-24T01:22:00Z',
          ref: { threadId: 't-long', anchorId: 'm1' },
        },
        {
          id: 'm2',
          crystal_id: id,
          kind: 'turn',
          source: 'auto',
          created_at: '2026-10-24T01:38:00Z',
          ref: { threadId: 't-ctx', anchorId: 'm1' },
        },
      ],
      checklistSpec,
      checklist: crystalChecklists.get(id) ?? {},
      validation: {
        ready: false,
        missing: summary.type ? ['validated'] : ['type', 'grounded', 'named'],
        conflicted: [],
      },
      related: ['cry_release'],
      termStats: { mentions: 14, threads: 4 },
    }
  )
}

/** `?fixture=legacy` simulates a desktop without refs or Crystals routes. */
const fixtureMode = new URLSearchParams(window.location.search).get('fixture')
const legacyDesktop = fixtureMode === 'legacy'
const emptyCrystals = fixtureMode === 'empty-crystals'

function refsRoute(
  method: string,
  pathname: string,
  query: string,
  body?: unknown,
) {
  const params = new URLSearchParams(query)
  if (pathname === '/api/refs/kinds') return json(200, { kinds: refKinds })
  if (pathname === '/api/refs/recent') {
    const kind = params.get('kind')
    return json(200, {
      items: refCorpus
        .filter((item) => item.id !== 't-refs' && (!kind || item.kind === kind))
        .slice(0, 6)
        .map((item, index) => ({
          uri: item.uri,
          kind: item.kind,
          label: item.title,
          count: 6 - index,
          lastAt: minutesAgo(index * 30),
        }))
        // Targets deleted on desktop still appear in recent; resolve misses.
        .concat(
          kind
            ? []
            : [
                {
                  uri: 'alma://project/ws_3a',
                  kind: 'project',
                  label: 'Michels',
                  count: 2,
                  lastAt: minutesAgo(400),
                },
                {
                  uri: 'alma://prompt/p_9f1',
                  kind: 'prompt',
                  label: 'Review rules',
                  count: 1,
                  lastAt: minutesAgo(420),
                },
              ],
        ),
    })
  }
  if (pathname === '/api/refs/snippets' && method === 'POST') {
    const { text } = JSON.parse(String(body)) as { text: string }
    return json(200, {
      id: 'snip-1',
      uri: 'alma://snippet/snip-1',
      title: null,
      text,
    })
  }
  if (pathname === '/api/refs/search') {
    const q = (params.get('q') ?? '').toLowerCase()
    const kinds = params.get('kinds')?.split(',')
    return json(200, {
      query: q,
      results: refCorpus.filter(
        (item) =>
          item.title.toLowerCase().includes(q) &&
          (!kinds || kinds.includes(item.kind)),
      ),
    })
  }
  if (pathname === '/api/refs/resolve' && method === 'GET') {
    const uri = params.get('uri') ?? ''
    const message = /^alma:\/\/thread\/([^/]+)\/message\/([^/]+)$/.exec(uri)
    const found = refCorpus.find((item) => item.uri === uri)
    const card = message
      ? {
          uri,
          kind: 'message',
          id: `${message[1]}/${message[2]}`,
          exists: true,
          title: 'Source message',
          subtitle: 'user in "Tablet layout and timeline"',
          summary:
            'Two-pane navigation keeps the thread list fixed while details scroll.',
          nav: {
            route: `/chat/${message[1]}#msg-${message[2]}`,
            threadId: message[1],
            messageId: message[2],
          },
        }
      : found
        ? { ...found, exists: true, summary: found.subtitle }
        : { uri, kind: 'reference', id: uri, exists: false, title: uri }
    return json(200, card)
  }
  if (pathname === '/api/refs/resolve' && method === 'POST') {
    const { uris } = JSON.parse(String(body)) as { uris: string[] }
    return json(200, {
      results: uris.map((uri) => {
        const message = /^alma:\/\/thread\/([^/]+)\/message\/([^/]+)$/.exec(uri)
        if (message) {
          const threadTitle =
            threads.find((item) => item.id === message[1])?.title ?? 'Untitled'
          return {
            uri,
            kind: 'message',
            id: message[2],
            exists: true,
            title: 'Source message',
            subtitle: `user in "${threadTitle}"`,
            summary:
              message[1] === 't-long'
                ? 'Two-pane navigation keeps the thread list fixed while details scroll.'
                : 'Keep context usage visible without crowding the thread header.',
            nav: { route: 'thread', threadId: message[1] },
          }
        }
        const found = refCorpus.find((item) => item.uri === uri)
        return found
          ? {
              ...found,
              exists: true,
              summary:
                found.kind === 'thread'
                  ? 'Two panes from 720 px; Back closes the detail pane and the list keeps its scroll position.'
                  : found.subtitle,
              ...(found.kind === 'thread'
                ? { nav: { route: 'thread', threadId: found.id } }
                : {}),
            }
          : (() => {
              // Desktop names a deleted target by its kind and bare id.
              const [, kind = 'reference', id = uri] =
                /^alma:\/\/([^/]+)\/(.+)$/.exec(uri) ?? []
              return { uri, kind, id, exists: false, title: id }
            })()
      }),
    })
  }
  if (pathname === '/api/refs/time-clues') {
    const rangeId = params.get('rangeId') ?? ''
    const startDate = rangeId.slice(0, 10)
    const day = (offset: number) => {
      const value = new Date(`${startDate}T00:00:00Z`)
      value.setUTCDate(value.getUTCDate() + offset)
      return value.toISOString().slice(0, 10)
    }
    const clues = [
      {
        id: `clue-${startDate}-1`,
        expression: 'before Friday',
        quote: 'Finish the release notes before Friday',
        date: startDate,
        endDate: null,
        time: '09:30',
        threadId: 't-long',
        threadTitle: 'Tablet layout and timeline',
        sourceUri: 'alma://thread/t-long/message/m1',
        threadUri: 'alma://thread/t-long',
        originalSentAt: NOW - 120_000,
        originalTimeZone: 'America/Los_Angeles',
        seen: false,
      },
      {
        id: `clue-${startDate}-2`,
        expression: 'tomorrow afternoon',
        quote: 'Review context usage tomorrow afternoon',
        date: day(1),
        endDate: null,
        time: '14:00',
        threadId: 't-ctx',
        threadTitle: 'Context window budget',
        sourceUri: 'alma://thread/t-ctx/message/m1',
        threadUri: 'alma://thread/t-ctx',
        originalSentAt: NOW - 60_000,
        originalTimeZone: 'America/Los_Angeles',
        seen: true,
      },
      {
        id: `clue-${startDate}-3`,
        expression: 'through Thursday',
        quote: 'Keep the rollout open through Thursday',
        date: day(2),
        endDate: day(4),
        time: null,
        threadId: 't-queue',
        threadTitle: 'Release checklist',
        sourceUri: 'alma://thread/t-queue/message/m1',
        threadUri: 'alma://thread/t-queue',
        originalSentAt: NOW - 30_000,
        originalTimeZone: 'America/Los_Angeles',
        seen: false,
      },
    ]
    return json(200, {
      clues,
      scheduled: [
        {
          id: `cron:${startDate}`,
          jobId: 'cron-weekly-report',
          uri: 'alma://cron/cron-weekly-report',
          name: 'Publish weekly report',
          dueAt: `${day(2)}T16:00:00.000Z`,
          date: day(2),
          endDate: null,
          time: '09:00',
          fired: false,
          threadId: 't-queue',
          threadTitle: 'Release checklist',
          threadUri: 'alma://thread/t-queue',
        },
      ],
      unread: 1,
      hasMore: false,
      nextOffset: null,
      coverage: 'new-original-user-messages-tool-model-or-grammar',
      allHistoryIndexed: false,
    })
  }
  if (pathname === '/api/refs/time-clues/days')
    return json(200, { clueDays: [], cronDays: [] })
  if (pathname === '/api/refs/time-clues/seen' && method === 'POST')
    return json(200, { ok: true })
  if (pathname === '/api/refs/time-clues/ignore' && method === 'POST')
    return json(200, { ok: true })
  if (pathname === '/api/refs/backlinks')
    return json(200, {
      backlinks: [
        {
          threadId: 't-ctx',
          threadTitle: 'Context window budget',
          messageId: 'm1',
          excerpt: 'Reuse the split layout rules for the usage sheet.',
          createdAt: minutesAgo(40),
        },
        {
          threadId: 't-refs',
          threadTitle: 'Ship review with references',
          createdAt: minutesAgo(6),
        },
        {
          threadId: 't-queue',
          threadTitle: 'Release checklist',
          snippet: 'Screenshots follow the tablet pass.',
          createdAt: minutesAgo(90),
        },
      ],
    })
  if (pathname === '/api/refs/backlink-counts' && method === 'POST') {
    const { uris = [] } = JSON.parse(String(body)) as { uris?: string[] }
    return json(200, {
      counts: Object.fromEntries(uris.map((uri, index) => [uri, index % 3])),
    })
  }
  if (pathname === '/api/crystal/overview')
    return json(
      200,
      emptyCrystals
        ? { ...crystalOverview, slots: [], backpack: [], formal: [], types: [] }
        : crystalOverview,
    )
  const action =
    /^\/api\/crystal\/([^/]+)\/(type|checklist|prefill|validate|confirm)$/.exec(
      pathname,
    )
  if (action) {
    const [, encodedId, kind] = action
    const id = decodeURIComponent(encodedId)
    if (kind === 'checklist' && method === 'PUT') {
      const update = JSON.parse(String(body)) as {
        field: string
        value?: string
        sources?: string[]
        conflict?: boolean
      }
      const checklist = { ...(crystalChecklists.get(id) ?? {}) }
      checklist[update.field] = {
        value: update.value ?? '',
        sources: update.sources ?? [],
        ...(typeof update.conflict === 'boolean'
          ? { conflict: update.conflict }
          : {}),
      }
      crystalChecklists.set(id, checklist)
      return json(200, { checklist })
    }
    if (kind === 'type' && method === 'POST') return json(200, { ok: true })
    if (kind === 'prefill' && method === 'POST') {
      crystalChecklists.set(id, {
        grounded: {
          value: 'Supported by the captured thread and decision note.',
          sources: ['turn:release-1', 'note:m2'],
        },
        named: { value: 'Release checklist', sources: ['turn:release-1'] },
      })
      return json(200, { filled: ['grounded', 'named'] })
    }
    if (kind === 'validate' && method === 'GET')
      return json(200, {
        ready: false,
        missing: id === 'cry_untyped' ? ['type'] : ['validated'],
        conflicted: [],
      })
    if (kind === 'confirm' && method === 'POST') return json(200, { ok: true })
  }
  const detail = /^\/api\/crystal\/([^/]+)$/.exec(pathname)
  const found = detail && crystalDetail(decodeURIComponent(detail[1]))
  return found ? json(200, found) : json(404, { error: 'Not found' })
}

// Probes isolation: a sandboxed preview must not reach the app's storage.
const FIXTURE_HTML = `<!doctype html><html><head><style>
body{font:16px system-ui;margin:0;padding:24px;background:#fef6e4;color:#172c66}
h1{margin:0 0 8px;font-size:24px}.card{padding:16px;border-radius:12px;background:#f3d2c1}
</style></head><body><h1>Launch page</h1><div class="card">Inline styles and scripts render.</div>
<p id="probe">probe pending</p><script>
let verdict='isolated'
try { const v = window.parent.localStorage.length; verdict='LEAK ' + v } catch (e) { verdict='isolated' }
document.getElementById('probe').textContent='parent storage: ' + verdict
</script></body></html>`

function route(method: string, path: string, body?: unknown): TunnelResponse {
  const [pathname, query = ''] = path.split('?')
  const thread = (id: string) => threads.find((item) => item.id === id)
  if (pathname === '/api/herdr/info')
    return json(200, {
      online: true,
      herdr: { type: 'pong', version: '0.9.5', protocol: 22 },
    })
  if (pathname === '/api/herdr/mutes') return json(200, { workspaces: [] })
  if (pathname === '/api/herdr/chat')
    return json(200, {
      session_id: 'fixture-session',
      page: { items: herdrChatItems, start: 0, end: herdrChatItems.length },
      queued: [],
    })
  if (pathname === '/api/herdr/rpc') {
    const request = JSON.parse(String(body ?? '{}')) as {
      method?: string
      params?: Record<string, unknown>
    }
    if (request.method === 'pane.read')
      return json(200, { result: { read: { text: herdrTerminal } } })
    return json(200, { result: { accepted: true } })
  }
  if (pathname === '/api/files-abs-binary') {
    const filePath = new URLSearchParams(query).get('path') ?? ''
    if (filePath.endsWith('missing-export.zip'))
      return json(404, { error: 'Not found' })
    if (filePath.endsWith('alma-android-preview.apk'))
      return binary(
        200,
        new TextEncoder().encode('Synthetic APK fixture'),
        'application/vnd.android.package-archive',
      )
    if (filePath.endsWith('2026-10-27.md'))
      return binary(
        200,
        new TextEncoder().encode('# Memory note\n\nEnd resources shipped.'),
        'text/markdown',
      )
    if (filePath.endsWith('release-brief.docx'))
      return binary(
        200,
        new TextEncoder().encode('Synthetic DOCX fixture'),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
    if (filePath.endsWith('release-notes.md'))
      return binary(
        200,
        new TextEncoder().encode(FIXTURE_MARKDOWN),
        'text/markdown',
      )
    if (filePath.endsWith('linked-brief.md'))
      return binary(
        200,
        new TextEncoder().encode(
          '# Linked brief\n\nThis relative link replaced the current file in the sheet.\n',
        ),
        'text/markdown',
      )
    if (filePath.endsWith('launch.html'))
      return binary(200, new TextEncoder().encode(FIXTURE_HTML), 'text/html')
    if (filePath.endsWith('interface-preview.png'))
      return binary(
        200,
        new TextEncoder().encode(FIXTURE_IMAGE),
        'image/svg+xml',
      )
    return json(404, { error: 'Not found' })
  }
  if (
    /^\/api\/(?:refs|crystal)\//.test(pathname) &&
    pathname !== '/api/refs/recipes' &&
    pathname !== '/api/refs/recipes/state'
  )
    return legacyDesktop
      ? json(404, { error: 'Not found' })
      : refsRoute(method, pathname, query, body)
  if (pathname === '/api/activity-recorder/suggestions')
    return legacyDesktop
      ? json(404, { error: 'Not found' })
      : json(200, {
          suggestions: [
            'Review the mobile layout',
            'Help me plan the next release',
            'Explore an idea together',
          ],
        })
  if (pathname === '/api/search/threads') {
    if (legacyDesktop) return json(404, { error: 'Not found' })
    const q = new URLSearchParams(query).get('q') || ''
    return json(200, [
      {
        id: 't-long',
        title: 'Tablet layout and timeline',
        matchCount: 4,
        messages: [
          {
            id:
              threads.find((t) => t.id === 't-long')?.messages?.[0]?.id ||
              'layout-1',
            message: {
              parts: [
                {
                  type: 'text',
                  text: `The **${q}** needs a careful review on phone and tablet. Keep the composer visible and the timeline easy to reach.`,
                },
              ],
            },
          },
          {
            id: 'layout-2',
            message: {
              parts: [
                {
                  type: 'text',
                  text: `Preserve the ${q} when navigating between conversations and projects.`,
                },
              ],
            },
          },
        ],
      },
      {
        id: 't-ctx',
        title: 'Context window budget',
        matchCount: 2,
        messages: [
          {
            id: 'context-match',
            message: {
              parts: [
                {
                  type: 'text',
                  text: `Compare the ${q} with the [release checklist](https://example.invalid). Make the search results readable at phone width.`,
                },
              ],
            },
          },
        ],
      },
    ])
  }
  if (pathname === '/api/health')
    return json(200, { name: 'Alma', status: 'ok', timestamp: NOW })
  if (pathname === '/api/models') return json(200, { data: models })
  if (pathname === '/api/settings')
    return json(200, {
      chat: { defaultModel: 'openai:gpt-5', modelUsageHistory: {} },
      general: { defaultWorkspaceId: 'ws-app' },
    })
  if (pathname === '/api/workspaces') return json(200, workspaces)
  if (pathname === '/api/attachments/file' && method === 'POST')
    return json(200, {
      filePath: '/tmp/alma-fixture/release-notes.txt',
      filename: 'release-notes.txt',
      size: 28,
    })
  if (pathname === '/api/refs/recipes') {
    const requested = new URLSearchParams(query).get('threadId')
    // Like the desktop, an acted-on recipe leaves `open` (kept across reloads).
    const acted = new Set(
      JSON.parse(sessionStorage.getItem(RECIPE_STATE_KEY) ?? '[]') as string[],
    )
    return json(
      200,
      requested === recipes.threadId
        ? {
            ...recipes,
            open: recipes.open.filter((recipe) => !acted.has(recipe.id)),
          }
        : { threadId: requested ?? '', open: [], all: [] },
    )
  }
  if (pathname === '/api/refs/recipes/state' && method === 'POST') {
    const { recipeId } = JSON.parse(String(body)) as { recipeId: string }
    const acted = JSON.parse(
      sessionStorage.getItem(RECIPE_STATE_KEY) ?? '[]',
    ) as string[]
    sessionStorage.setItem(
      RECIPE_STATE_KEY,
      JSON.stringify([...new Set([...acted, recipeId])]),
    )
    return json(200, { ok: true })
  }
  if (pathname === '/api/handoff/tool-approvals')
    return json(200, [
      {
        requestId: 'approval-attachment-review',
        source: 'bash',
        title: 'Run release checks',
        message: 'npm run check && npm run smoke',
        confirmLabel: 'Run checks',
        cancelLabel: 'Deny',
        type: 'command',
        threadId: 't-gen',
      },
    ])
  // An idle thread waiting on the user, for the list's response mark.
  if (pathname === '/api/handoff/user-questions')
    return json(200, [
      {
        requestId: 'question-navigation-hierarchy',
        source: 'claude',
        threadId: 't-ctx',
        questions: [
          {
            header: 'Budget',
            question: 'Keep the context budget at 70%?',
            options: [{ label: 'Yes' }, { label: 'No' }],
            multiSelect: false,
          },
        ],
      },
    ])
  if (pathname.startsWith('/api/handoff/')) return json(200, [])
  if (pathname === '/api/threads/t-gen/subagents/live')
    return json(200, [
      {
        context: {
          taskId: 'task-queue-polish',
          threadId: 't-gen',
          parentToolCallId: 'call-task-running',
          subagentMessageId: 'subagent-task-queue-polish-1000',
        },
        lastSeq: 2,
        message: {
          id: 'subagent-task-queue-polish-1000',
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: 'Checking the queue reducer and its focused tests.',
              state: 'input-streaming',
            },
            {
              type: 'tool-Read',
              toolCallId: 'sub-read',
              state: 'output-available',
              input: { file_path: 'src/screens/threadQueue.ts' },
              output: 'export function moveQueuedMessage',
            },
          ],
        },
      },
    ])
  if (pathname.includes('/subagents/live')) return json(200, [])
  if (pathname === '/api/threads' && method === 'GET')
    return json(
      200,
      threads.map(({ messages: _messages, ...summary }) => summary),
    )
  const match = /^\/api\/threads\/([^/]+)(?:\/([^/]+))?$/.exec(pathname)
  const found = match && thread(decodeURIComponent(match[1]))
  if (!found) return json(404, { error: 'Thread not found' })
  if (!match?.[2] && fixtureError === 'generic')
    return json(500, { error: 'Synthetic fixture failure' })
  const sub = match[2]
  if (!sub && method === 'PUT') {
    const { skipUpdatedAt, ...input } = JSON.parse(String(body)) as Partial<
      Thread & { skipUpdatedAt: boolean }
    >
    if (pendingTodoDone && found.id === 't-task-cards-complete')
      return pendingResponse()
    // Desktop honors the control flag and otherwise bumps updatedAt.
    Object.assign(found, input, skipUpdatedAt ? {} : { updatedAt: Date.now() })
    return json(200, found)
  }
  if (!sub) return json(200, found)
  if (sub === 'goal') {
    if (method === 'DELETE') {
      const previous = goals[found.id] as { condition?: string } | undefined
      goals[found.id] = null
      return json(200, { cleared: previous?.condition ?? null })
    }
    if (method === 'PUT') {
      const input = JSON.parse(String(body)) as {
        condition: string
        edit?: boolean
      }
      goals[found.id] = {
        condition: input.condition,
        setAt: NOW,
        turnsEvaluated: 0,
      }
      return json(200, { goal: goals[found.id], started: !input.edit })
    }
    const goal = goals[found.id] as
      { pausedAt?: number; achievedAt?: number } | undefined
    return json(200, {
      goal: goal ?? null,
      active: Boolean(goal && !goal.pausedAt && !goal.achievedAt),
    })
  }
  if (sub === 'loop') {
    if (method === 'DELETE') {
      const current = loops[found.id] as
        { prompt?: string; stoppedAt?: number } | undefined
      if (current) loops[found.id] = { ...current, stoppedAt: NOW }
      return json(200, { stopped: current?.prompt ?? null })
    }
    if (method === 'PUT') {
      const input = JSON.parse(String(body)) as { prompt: string }
      loops[found.id] = {
        prompt: input.prompt.replace(/^\d+\s*[smhd]\b\s*/i, ''),
        intervalMs: 300_000,
        startedAt: NOW,
        iterations: 0,
      }
      return json(200, { loop: loops[found.id], interval: '5m' })
    }
    const loop = loops[found.id] as { stoppedAt?: number } | undefined
    return json(200, {
      loop: loop ?? null,
      active: Boolean(loop && !loop.stoppedAt),
    })
  }
  if (sub === 'messages') return json(200, found.messages)
  if (sub === 'file-writes') {
    const longOld = Array.from(
      { length: 330 },
      (_, index) => `old line ${index + 1}`,
    ).join('\n')
    const longNew = Array.from({ length: 330 }, (_, index) =>
      index % 25 === 0 ? `changed line ${index + 1}` : `old line ${index + 1}`,
    ).join('\n')
    const files = Array.from({ length: 14 }, (_, index) => {
      const type = index % 3 === 0 ? ('edit' as const) : ('write' as const)
      return {
        type,
        filePath: `/home/shared/code/alma-mobile/${index < 9 ? 'src/screens' : 'docs'}/thread-file-${index + 1}.${index % 2 ? 'ts' : 'md'}`,
        ...(type === 'edit'
          ? {
              oldString: index === 0 ? longOld : 'old line\nsecond line',
              newString:
                index === 0 ? longNew : 'new line\nsecond line\nthird line',
              replaceAll: false,
            }
          : {
              content:
                index === 2
                  ? Array.from(
                      { length: 55 },
                      (_, line) => `new line ${line + 1}`,
                    ).join('\n')
                  : 'one\ntwo\nthree\nfour',
              bytesWritten: 18,
              previousContent: index % 4 === 0 ? 'one\ntwo' : undefined,
            }),
        messageId:
          index < 5 ? `t-end-resources--subagent-task-${index}-1` : `m${index}`,
        toolCallId: `fixture-file-${index}`,
        timestamp: new Date(NOW - index * 3_600_000).toISOString(),
      }
    })
    return json(200, { fileWrites: files })
  }
  if (sub === 'diff-stats')
    return json(200, { additions: 148, deletions: 36, filesChanged: 7 })
  if (sub === 'agent-crew')
    return json(
      200,
      found.id === 't-gen'
        ? {
            missions: [
              {
                id: 'mission-missions',
                title: 'Mobile UI delivery',
                objective:
                  'Port the desktop loading, crew and resource surfaces.',
                status: 'active',
                rootMessageId: 't-gen--m4',
                harnessMode: 'crew',
                runs: [
                  {
                    id: 'run-1',
                    taskId: 'task-1',
                    agentName: 'Developer',
                    executionMode: 'implementation',
                    model: 'Claude Sonnet',
                    status: 'completed',
                    inputSummary: 'Implement the loading indicators.',
                    outputSummary: 'Added the dot grid and canvas orb.',
                    createdAt: NOW - 70_000,
                  },
                  {
                    id: 'run-2',
                    taskId: 'task-2',
                    agentName: 'Evaluator',
                    executionMode: 'review',
                    model: 'GPT-5',
                    status:
                      new URLSearchParams(window.location.search).get(
                        'crew',
                      ) === 'idle'
                        ? 'completed'
                        : 'active',
                    inputSummary: 'Review screenshots and tests.',
                    createdAt: NOW - 30_000,
                  },
                ],
                handoffs: [
                  {
                    id: 'handoff-1',
                    toAgentName: 'Developer',
                    status: 'completed',
                    packet: {
                      goal: 'Ship the mobile UI pass',
                      deliverable: 'Verified APK',
                      acceptanceCriteria: ['Tests pass'],
                    },
                    resultSummary: 'Implementation ready for review.',
                    createdAt: NOW - 90_000,
                  },
                ],
                summary: {
                  totalRuns: 2,
                  completedRuns: 1,
                  failedRuns: 0,
                  activeRuns: 1,
                },
              },
            ],
          }
        : { missions: [] },
    )
  if (sub === 'context-usage') {
    if (!new URLSearchParams(query).get('model'))
      return json(400, { error: 'Model parameter is required' })
    const percent = fixtureContextPercent(found.id)
    return json(200, {
      threadId: found.id,
      usagePercent: percent,
      totalTokens: Math.round((percent / 100) * 200_000),
      contextWindow: 200_000,
    })
  }
  if (sub === 'compact' && method === 'POST')
    return json(200, { success: true, compactedCount: 4, savedTokens: 61_000 })
  return json(404, { error: 'Not found' })
}

/** Realtime events every `/ws/threads` subscriber receives once opened. */

const herdrSnapshot = {
  version: '0.9.5',
  protocol: 22,
  workspaces: [
    { workspace_id: 'w-mobile', label: 'Alma Android' },
    { workspace_id: 'w-site', label: 'Documentation site' },
  ],
  tabs: [
    { tab_id: 't-impl', workspace_id: 'w-mobile', label: 'Implementation' },
    { tab_id: 't-review', workspace_id: 'w-mobile', label: 'Review' },
    { tab_id: 't-docs', workspace_id: 'w-site', label: 'Docs' },
  ],
  panes: [
    {
      pane_id: 'w1:p1',
      workspace_id: 'w-mobile',
      tab_id: 't-impl',
      agent: 'claude',
      agent_status:
        screenshotParams.get('agentState') === 'blocked'
          ? 'blocked'
          : 'working',
      terminal_title_stripped:
        '修复 Herdr 终端布局并验证 extremely long Fold7 responsive terminal title',
    },
    {
      pane_id: 'w1:p2',
      workspace_id: 'w-mobile',
      tab_id: 't-review',
      agent: 'codex',
      agent_status: 'done',
      terminal_title_stripped: 'Review request shapes',
    },
    {
      pane_id: 'w2:p1',
      workspace_id: 'w-site',
      tab_id: 't-docs',
      agent: 'claude',
      agent_status: 'idle',
      terminal_title_stripped: 'Update protocol notes',
    },
  ],
}
const herdrChatItems = [
  {
    id: 'agent-user-1',
    kind: 'user',
    text: 'Please finish the provider integration and verify the phone layout.',
  },
  {
    id: 'agent-assistant-1',
    kind: 'assistant',
    text: 'I updated the reconnect path and added exact RPC request-shape tests. Next I am checking the fixture screens for overflow.',
  },
  {
    id: 'agent-tool-1',
    kind: 'tool',
    tool: {
      name: 'npm test',
      summary: 'Focused Herdr tests passed',
      done: true,
    },
  },
  {
    id: 'agent-tool-2',
    kind: 'tool',
    tool: {
      name: 'exec',
      input: {
        input:
          'text(await tools.exec_command({cmd:"npm run android:build",yield_time_ms:1000}));',
      },
      result: 'BUILD SUCCESSFUL in 31s',
      done: true,
    },
  },
  {
    id: 'agent-assistant-2',
    kind: 'assistant',
    text: 'The build passed.\n\n<oai-mem-citation>\n<citation_entries>\nMEMORY.md:1-2|note=[fixture]\n</citation_entries>\n</oai-mem-citation>',
  },
  {
    id: 'agent-tool-3',
    kind: 'tool',
    tool: {
      name: 'request_user_input_async',
      input: {
        questions: [
          {
            title: 'Install the build on the phone now?',
            options: ['Install now', 'Later'],
          },
        ],
      },
      result: '{"accepted":true}',
      done: true,
    },
  },
]
const herdrLongLine =
  'Rendering a synthetic 160-column terminal snapshot with a deliberately long command and ANSI colors so narrow phones must wrap it without leaking beyond the detail pane.'
const herdrTerminal =
  screenshotParams.get('agentState') === 'blocked'
    ? `Claude Code needs permission to run the Android build.

\u001b[1m❯ 1. Yes, allow once\u001b[0m
  2. Yes, and remember
  3. No, deny`
    : `\u001b[2m$\u001b[0m npm run check -- --fixture-terminal-columns=160
\u001b[38;2;152;195;121m✓\u001b[0m TypeScript
\u001b[38;2;152;195;121m✓\u001b[0m Vitest
\u001b[38;2;152;195;121m✓\u001b[0m Prettier

\u001b[48;2;74;77;84m\u001b[1m› \u001b[0m\u001b[48;2;74;77;84m${herdrLongLine}\u001b[0m
\u001b[38;2;246;226;183m宽字符检查：终端中的中文应该占两个单元格，而且这一整行会继续包含 ASCII words to exercise wrapping at the phone width instead of clipping the right side.\u001b[0m
\u001b[38;2;97;175;239m${herdrLongLine}\u001b[0m
\u001b[38;2;246;226;183mGPT-6 medium\u001b[0m \u001b[38;2;169;170;173m~/project\u001b[0m`

const threadEvents = [
  {
    type: 'generating_snapshot',
    data: { ids: pendingShot ? ['t-ctx'] : ['t-gen'] },
  },
  ...(pendingShot === 'phase'
    ? [
        {
          type: 'memory_retrieval_progress',
          data: {
            threadId: 't-ctx',
            stage: 'searching',
            message: 'Memories retrieved',
            retrievedMemories: [],
          },
        },
      ]
    : []),
  ...(new URLSearchParams(window.location.search).has('recipeReady')
    ? [
        {
          type: 'recipe_ready',
          data: { threadId: 't-gen', recipe: fixtureRecipe },
        },
      ]
    : []),
  ...(pendingShot === 'reasoning'
    ? [
        {
          type: 'message_added',
          data: {
            id: 't-ctx--pending-assistant',
            threadId: 't-ctx',
            message: {
              id: 'pending-assistant',
              role: 'assistant',
              parts: [
                {
                  type: 'reasoning',
                  text: 'I’ll first inspect the current state.',
                },
              ],
            },
            timestamp: NOW,
          },
        },
      ]
    : []),
  ...(!pendingShot
    ? [
        {
          type: 'generation_completed',
          data: {
            threadId: 't-ctx',
            assistantMessageId: 'm5',
            model: 'gpt-5',
            providerId: 'openai',
            usage: {
              inputTokens: 142_380,
              outputTokens: 1_912,
              totalTokens: 144_292,
              reasoningTokens: 640,
              cachedInputTokens: 118_400,
              cacheWriteInputTokens: 0,
            },
          },
        },
      ]
    : []),
]

function mockSocket(path: string): TunnelSocket {
  const listeners = new Set<(data: string | Uint8Array) => void>()
  const socket: TunnelSocket = {
    opened: Promise.resolve(),
    send: () => undefined,
    onMessage(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onClose: () => () => undefined,
    close: () => listeners.clear(),
  }
  if (path === '/ws/threads')
    setTimeout(() => {
      for (const event of threadEvents)
        for (const listener of listeners)
          listener(JSON.stringify({ ...event, timestamp: NOW }))
    }, 400)
  if (path === '/ws/herdr')
    setTimeout(() => {
      for (const event of [
        { type: 'herdr', online: true },
        { type: 'snapshot', snapshot: herdrSnapshot },
      ])
        for (const listener of listeners) listener(JSON.stringify(event))
    }, 20)
  if (path.startsWith('/ws/herdr/chat'))
    setTimeout(() => {
      for (const listener of listeners)
        listener(JSON.stringify({ type: 'queued', queued: [] }))
    }, 20)
  if (path.startsWith('/ws/herdr/screen'))
    setTimeout(() => {
      for (const listener of listeners)
        listener(
          JSON.stringify({
            type: 'screen',
            read: { text: herdrTerminal },
            cols: 160,
            rows: 32,
          }),
        )
    }, 20)
  if (path.startsWith('/ws/screen'))
    setTimeout(async () => {
      const data = await SCREEN_JPEG
      const events = [
        {
          type: 'status',
          bound: true,
          displayId: 1,
          width: 1280,
          height: 800,
          scale: 2,
          mode: 'jpeg',
        },
        { type: 'viewport', width: 1280, height: 800 },
        { type: 'frame', data, width: 1280, height: 800, seq: 1 },
      ]
      for (const event of events)
        for (const listener of listeners) listener(JSON.stringify(event))
    }, 120)
  return socket
}

function createTunnel(targetPairing?: StoredPairing): ManagedTunnel {
  const params = new URLSearchParams(window.location.search)
  const delayThreadMs = Number(params.get('delayThreadMs') ?? 0)
  const delayListMs = Number(params.get('delayListMs') ?? 0)
  const fixtureOffline =
    params.has('shareOffline') && targetPairing?.id === THIRD_DESKTOP_ID
  const tunnel: ManagedTunnel = {
    connectionState: fixtureOffline ? 'offline' : 'connected',
    connect: async () => {
      const status = new URLSearchParams(window.location.search).get('status')
      if (status === 'offline')
        setTimeout(() => tunnel.onConnectionState?.('offline'), 800)
      if (status === 'relay-error' || fixtureOffline)
        throw new Error('Relay connection failed')
    },
    close: () => undefined,
    fetch: async (path, init = {}) => {
      const pathname = new URL(path, 'https://fixture.local').pathname
      const delay = /^\/api\/threads\/[^/]+$/.test(pathname)
        ? delayThreadMs
        : pathname === '/api/threads' || pathname === '/api/workspaces'
          ? delayListMs
          : 0
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
      return route(init.method ?? 'GET', path, init.body)
    },
    openWebSocket: mockSocket,
  }
  return tunnel
}

// Seed each desktop cache so an offline desktop still contributes disabled
// conversation rows to the share target, just like the real app.
for (const target of fixturePairings)
  persistThreadList(
    window.localStorage,
    target.id,
    threads.map(({ messages: _messages, ...thread }) => thread),
    workspaces,
  )

// Deterministic unseen assistant reply, isolated to this synthetic browser context.
window.localStorage.setItem(
  'alma-unread-v1',
  JSON.stringify({
    [DESKTOP_ID]: {
      't-long': {
        updated: NOW,
        lastSeenAt: NOW - 60_000,
        assistant: true,
        unread: true,
      },
    },
  }),
)
// List badges read local drafts and queues; seed them for the fake desktop.
saveDraft(window.localStorage, DESKTOP_ID, 't-draft', 'Lead with the free tier')
saveDraft(
  window.localStorage,
  DESKTOP_ID,
  't-refs',
  'Also check @[Release checklist](alma://crystal/cry_release)',
)
saveThreadQueue(
  window.localStorage,
  DESKTOP_ID,
  't-queue',
  [
    ['Bump the preview version', []],
    [
      'Tag the build after the browser checks pass',
      [
        {
          kind: 'file' as const,
          name: 'release-notes.md',
          mediaType: 'text/markdown',
          filePath: '/tmp/release-notes.md',
        },
      ],
    ],
    ['Update the rollout note for the mobile team', []],
    ['Share the final screenshot set', []],
    ['Post the verification totals to the release thread', []],
  ]
    .slice(0, queueCount)
    .reduce(
      (queue, [content, attachments], index) =>
        addQueuedMessage(
          queue,
          content as string,
          attachments as Parameters<typeof addQueuedMessage>[2],
          NOW + index,
          `fixture-queue-${index}`,
        ),
      [] as ReturnType<typeof addQueuedMessage>,
    ),
)

const initialRoute =
  new URLSearchParams(window.location.search).get('route') ??
  `/d/${DESKTOP_ID}/threads`
const trackHistory = screenshotParams.has('trackHistory')
if (trackHistory) window.history.replaceState(null, '', initialRoute)
const Router = trackHistory ? BrowserRouter : MemoryRouter
const routerProps = trackHistory ? {} : { initialEntries: [initialRoute] }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <Router {...routerProps}>
        <ThemeProvider>
          <App
            fixture={{
              store: { pairings: fixturePairings, activeId: DESKTOP_ID },
              createTunnel,
              statusByDesktop: screenshotParams.has('shareOffline')
                ? { [THIRD_DESKTOP_ID]: 'offline' }
                : undefined,
            }}
          />
        </ThemeProvider>
      </Router>
    </LanguageProvider>
  </React.StrictMode>,
)
