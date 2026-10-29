// Captures the README screenshots from the synthetic fixture (no relay, no
// desktop, no real threads). Starts its own Vite dev server.
//
//   npm run screenshots [-- <outDir> [<file-filter-regex>]]
//   (default /tmp/alma-shots; e.g. `-- /tmp/alma-shots-refs 'refs|crystal'`)
//
// Playwright is not a project dependency; point NODE_PATH at any install,
// e.g. NODE_PATH=$(npm root -g) or an `npx playwright` cache directory.
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const args = process.argv.slice(2)
const nativeSafeTopIndex = args.indexOf('--native-safe-top')
const nativeSafeTop =
  nativeSafeTopIndex >= 0
    ? Number.parseFloat(args.splice(nativeSafeTopIndex, 2)[1] ?? '')
    : 40
if (!Number.isFinite(nativeSafeTop) || nativeSafeTop < 0)
  throw new Error(`invalid --native-safe-top: ${nativeSafeTop}`)
const outDir = process.env.ALMA_SHOTS_DIR ?? args[0] ?? '/tmp/alma-shots'
const only = args[1] ? new RegExp(args[1]) : undefined
const themeOverride = process.env.ALMA_SHOTS_THEME
const themeMode = process.env.ALMA_SHOTS_THEME_MODE
const DESKTOP = '/d/fixture-desktop/threads'
const PHONE = { width: 412, height: 915 }
const FILE_PHONE = { width: 360, height: 800 }
const TABLET = { width: 884, height: 1104 }
const TAB_TWO_PANE = { width: 900, height: 1000 }
const NARROW_TWO_PANE = { width: 720, height: 1000 }
const simulatedNativeInsets = {
  top: nativeSafeTop,
  right: 0,
  bottom: 24,
  left: 0,
}

async function touch(page, type, x, y) {
  const session =
    page.__touchSession ?? (await page.context().newCDPSession(page))
  page.__touchSession = session
  await session.send('Input.dispatchTouchEvent', {
    type,
    touchPoints:
      type === 'touchEnd' || type === 'touchCancel'
        ? []
        : [{ x, y, radiusX: 4, radiusY: 4, force: 1 }],
  })
}

async function touchDrag(page, selector, dx, dy, release = true) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`touch target missing: ${selector}`)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await touch(page, 'touchStart', x, y)
  await touch(page, 'touchMove', x + dx, y + dy)
  if (release) await touch(page, 'touchEnd', x + dx, y + dy)
  return { x, y }
}

async function slowTouchDrag(page, selector, dx, dy, steps = 6) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`touch target missing: ${selector}`)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await touch(page, 'touchStart', x, y)
  for (let step = 1; step <= steps; step += 1) {
    await touch(
      page,
      'touchMove',
      x + (dx * step) / steps,
      y + (dy * step) / steps,
    )
    await page.waitForTimeout(40)
  }
  await touch(page, 'touchEnd', x + dx, y + dy)
}

// Types after the seeded `@Release checklist` draft token in the refs thread.
async function typeInComposer(page, value) {
  const composer = page.locator('.composer textarea')
  await composer.focus()
  await composer.press('End')
  await page.keyboard.type(value)
}

async function assertFixedHeader(
  page,
  bodySelector,
  headerSelector,
  fixedSelectors = [],
) {
  const result = await page.evaluate(
    ({ bodySelector, headerSelector, fixedSelectors }) => {
      const body = document.querySelector(bodySelector)
      const header = document.querySelector(headerSelector)
      const fixedElements = fixedSelectors.map((selector) => ({
        selector,
        element: document.querySelector(selector),
      }))
      if (
        !(body instanceof HTMLElement) ||
        !(header instanceof HTMLElement) ||
        fixedElements.some(({ element }) => !(element instanceof HTMLElement))
      )
        throw new Error('scroll assertion target missing')
      const before = header.getBoundingClientRect().top
      const fixedBefore = fixedElements.map(({ selector, element }) => ({
        selector,
        top: element.getBoundingClientRect().top,
      }))
      body.scrollTop = 600
      const after = header.getBoundingClientRect().top
      const fixedAfter = fixedElements.map(({ selector, element }) => ({
        selector,
        top: element.getBoundingClientRect().top,
      }))
      return {
        before,
        after,
        fixedBefore,
        fixedAfter,
        bodyScrollTop: body.scrollTop,
        documentScrollTop: document.scrollingElement?.scrollTop ?? -1,
      }
    },
    { bodySelector, headerSelector, fixedSelectors },
  )
  if (result.bodyScrollTop <= 0)
    throw new Error(`${bodySelector} did not scroll`)
  if (Math.abs(result.before - result.after) > 0.5)
    throw new Error(`${headerSelector} moved while its page body scrolled`)
  result.fixedBefore.forEach(({ selector, top }, index) => {
    if (Math.abs(top - result.fixedAfter[index].top) > 0.5)
      throw new Error(`${selector} moved while its page body scrolled`)
  })
  if (result.documentScrollTop !== 0)
    throw new Error(`document scrolled to ${result.documentScrollTop}`)
}

async function assertTabIndicatorGeometry(
  page,
  tablistSelector = '.thread-tabs',
) {
  await page.waitForFunction((tablistSelector) => {
    const tablist = document.querySelector(tablistSelector)
    const selected = tablist?.querySelector('[aria-selected="true"]')
    const indicator = tablist?.querySelector('.tab-bar-indicator')
    if (
      !(selected instanceof HTMLElement) ||
      !(indicator instanceof HTMLElement)
    )
      return false
    const selectedRect = selected.getBoundingClientRect()
    const indicatorRect = indicator.getBoundingClientRect()
    return (
      Math.abs(indicatorRect.left - selectedRect.left) <= 1 &&
      Math.abs(indicatorRect.right - selectedRect.right) <= 1
    )
  }, tablistSelector)
  const geometry = await page.evaluate((tablistSelector) => {
    const tablist = document.querySelector(tablistSelector)
    const selected = tablist?.querySelector('[aria-selected="true"]')
    if (!(tablist instanceof HTMLElement) || !(selected instanceof HTMLElement))
      throw new Error('tab indicator assertion target missing')
    const tablistRect = tablist.getBoundingClientRect()
    const selectedRange = document.createRange()
    selectedRange.selectNodeContents(selected)
    const textRect = selectedRange.getBoundingClientRect()
    const indicator = tablist.querySelector('.tab-bar-indicator')
    if (!(indicator instanceof HTMLElement))
      throw new Error('tab indicator element missing')
    const indicatorRect = indicator.getBoundingClientRect()
    const style = getComputedStyle(indicator)
    const indicatorLeft = indicatorRect.left
    const indicatorWidth = indicatorRect.width
    const legacyLeft =
      tablistRect.left + (selected.textContent?.trim() === 'Projects' ? 72 : 0)
    return {
      textLeft: textRect.left,
      textRight: textRect.right,
      legacyLeft,
      legacyRight: legacyLeft + 48,
      indicatorLeft,
      indicatorRight: indicatorLeft + indicatorWidth,
      indicatorTop: indicatorRect.top,
      visibleHeight:
        Math.min(indicatorRect.bottom, tablistRect.bottom) -
        Math.max(indicatorRect.top, tablistRect.top),
      cssHeight: Number.parseFloat(style.height),
    }
  }, tablistSelector)
  console.log(`tab indicator geometry ${JSON.stringify(geometry)}`)
  if (Math.abs(geometry.visibleHeight - 2) > 0.1 || geometry.cssHeight !== 2)
    throw new Error(`tab indicator clipped: ${JSON.stringify(geometry)}`)
  if (
    Math.abs(geometry.indicatorLeft - geometry.textLeft) > 1 ||
    Math.abs(geometry.indicatorRight - geometry.textRight) > 1
  )
    throw new Error(
      `tab indicator alignment failed: ${JSON.stringify(geometry)}`,
    )
}

async function assertNoHorizontalOverflow(page, selector) {
  const overflow = await page.evaluate((selector) => {
    const node = document.querySelector(selector)
    if (!(node instanceof HTMLElement))
      throw new Error(`overflow target missing: ${selector}`)
    return node.scrollWidth - node.clientWidth
  }, selector)
  if (overflow > 0)
    throw new Error(`${selector} overflows horizontally by ${overflow}px`)
}

async function waitForProjectGroupSettled(page) {
  await page.waitForFunction(() => {
    const group = document.querySelector('.project-group.open')
    return group && group.getAnimations({ subtree: true }).length === 0
  })
}

async function assertSelectedRowGeometry(
  page,
  rowSelector,
  scrollSelector,
  alignmentSelector = '.thread-tabs button[aria-selected="true"]',
  indent = 0,
) {
  const geometry = await page.evaluate(
    ({ rowSelector, scrollSelector, alignmentSelector }) => {
      const row = document.querySelector(rowSelector)
      const scroll = document.querySelector(scrollSelector)
      const text = row?.querySelector('h2, .thread-copy, span')
      const alignment = document.querySelector(alignmentSelector)
      if (
        !(row instanceof HTMLElement) ||
        !(scroll instanceof HTMLElement) ||
        !(text instanceof HTMLElement) ||
        !(alignment instanceof HTMLElement)
      )
        throw new Error('selected row assertion target missing')
      const rowRect = row.getBoundingClientRect()
      const scrollRect = scroll.getBoundingClientRect()
      const textRect = text.getBoundingClientRect()
      const alignmentRect = alignment.getBoundingClientRect()
      const clippingAncestor = (() => {
        let node = row.parentElement
        while (node && node !== scroll) {
          const overflow = getComputedStyle(node).overflow
          if (overflow === 'hidden' || overflow === 'clip')
            return node.className
          node = node.parentElement
        }
        return null
      })()
      return {
        leftGap: rowRect.left - scrollRect.left,
        rightGap: scrollRect.right - rowRect.right,
        textLeft: textRect.left,
        textInset: textRect.left - rowRect.left,
        alignmentLeft: alignmentRect.left,
        radius: getComputedStyle(row).borderRadius,
        clippingAncestor,
      }
    },
    { rowSelector, scrollSelector, alignmentSelector },
  )
  console.log(`selected row geometry ${JSON.stringify(geometry)}`)
  if (geometry.leftGap < 4 || geometry.rightGap < 4)
    throw new Error(`selected row edge gap failed: ${JSON.stringify(geometry)}`)
  if (geometry.textInset < 8)
    throw new Error(
      `selected row text inset failed: ${JSON.stringify(geometry)}`,
    )
  if (Math.abs(geometry.textLeft - geometry.alignmentLeft - indent) > 4)
    throw new Error(
      `selected row text alignment failed: ${JSON.stringify(geometry)}`,
    )
  if (!['6px', '10px'].includes(geometry.radius))
    throw new Error(`selected row radius failed: ${JSON.stringify(geometry)}`)
}

async function assertComposerCentered(page) {
  const geometry = await page.evaluate(() => {
    const pane = document.querySelector('.split-main')
    const composer = document.querySelector('.composer-shell')
    if (!(pane instanceof HTMLElement) || !(composer instanceof HTMLElement))
      throw new Error('composer centering target missing')
    const paneRect = pane.getBoundingClientRect()
    const composerRect = composer.getBoundingClientRect()
    return {
      paneCenter: paneRect.left + paneRect.width / 2,
      composerCenter: composerRect.left + composerRect.width / 2,
    }
  })
  if (Math.abs(geometry.paneCenter - geometry.composerCenter) > 1)
    throw new Error(`composer is not centered: ${JSON.stringify(geometry)}`)
}

async function pauseSidebarCollapse(page, progress) {
  const start = await page
    .locator('.split-main')
    .evaluate((node) => node.getBoundingClientRect().width)
  const scroller = page.locator('.split-sidebar .threads-page-body')
  await scroller.evaluate((node) => {
    node.scrollTop = 120
  })
  const scrollTop = await scroller.evaluate((node) => node.scrollTop)
  await page.getByRole('button', { name: 'Hide thread list' }).click()
  await page.locator('.split-shell.collapsed').waitFor()
  await page.waitForFunction(() =>
    document
      .querySelector('.split-shell')
      ?.getAnimations({ subtree: true })
      .some((animation) => animation.playState === 'running'),
  )
  await page.locator('.split-shell').evaluate((shell, progress) => {
    const animations = shell
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().duration)
    for (const animation of animations) {
      animation.pause()
      const duration = Number(animation.effect?.getTiming().duration ?? 0)
      animation.currentTime = duration * progress
    }
  }, progress)
  await page.evaluate(() => new Promise(requestAnimationFrame))
  const geometry = await page.locator('.split-shell').evaluate((shell) => {
    const pane = shell.querySelector('.split-main')
    const sidebarScroller = shell.querySelector(
      '.split-sidebar .threads-page-body',
    )
    if (
      !(pane instanceof HTMLElement) ||
      !(sidebarScroller instanceof HTMLElement)
    )
      throw new Error('sidebar transition geometry target missing')
    return {
      width: pane.getBoundingClientRect().width,
      scrollTop: sidebarScroller.scrollTop,
    }
  })
  const end = await page.locator('.split-shell').evaluate((shell) => {
    const rail = shell.querySelector('.split-rail')
    if (!(rail instanceof HTMLElement)) throw new Error('split rail missing')
    return (
      shell.getBoundingClientRect().width - rail.getBoundingClientRect().width
    )
  })
  if (
    progress > 0 &&
    progress < 1 &&
    !(geometry.width >= start && geometry.width <= end)
  )
    throw new Error(
      `mid-collapse pane width is outside endpoints: ${JSON.stringify({ start, mid: geometry.width, end })}`,
    )
  if (geometry.scrollTop !== scrollTop)
    throw new Error(
      `sidebar scroll position changed: ${JSON.stringify({ before: scrollTop, after: geometry.scrollTop })}`,
    )
  await assertComposerCentered(page)
  console.log(
    `sidebar collapse geometry ${JSON.stringify({ start, current: geometry.width, end, progress })}`,
  )
}

async function pausePhonePush(page, progress) {
  await page.evaluate(async (progress) => {
    document.documentElement.dataset.navMotion = 'push'
    const transition = document.startViewTransition?.(() => {
      const row = document.querySelector('.thread-row')
      if (!(row instanceof HTMLElement)) throw new Error('thread row missing')
      row.click()
    })
    if (!transition) throw new Error('View Transitions API unavailable')
    await transition.ready
    for (const animation of document.getAnimations()) {
      const pseudo = animation.effect?.pseudoElement ?? ''
      if (!pseudo.includes('view-transition')) continue
      animation.pause()
      const duration = Number(animation.effect?.getTiming().duration ?? 0)
      animation.currentTime = duration * progress
    }
  }, progress)
  await page.locator('.thread-detail').waitFor()
}

async function openComposerEditor(page, progress = 1) {
  const origin = await page.locator('.composer-shell').boundingBox()
  if (!origin) throw new Error('inline composer shell missing')
  await page.getByRole('button', { name: 'Expand editor' }).click()
  const dialog = page.getByRole('dialog', { name: 'Message editor' })
  await dialog.waitFor()
  const geometry = await dialog.evaluate((node, progress) => {
    const animation = node
      .getAnimations()
      .find((candidate) =>
        ['fullscreen-editor-in', 'fullscreen-editor-reduced-in'].includes(
          candidate.animationName,
        ),
      )
    if (!animation) throw new Error('composer editor animation missing')
    animation.pause()
    const duration = Number(animation.effect?.getTiming().duration ?? 0)
    animation.currentTime = duration * progress
    const rect = node.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }
  }, progress)
  if (
    progress === 0 &&
    (Math.abs(geometry.left - origin.x) > 2 ||
      Math.abs(geometry.top - origin.y) > 2 ||
      Math.abs(geometry.width - origin.width) > 2 ||
      Math.abs(geometry.height - origin.height) > 2)
  )
    throw new Error(
      `editor origin geometry failed: ${JSON.stringify({ origin, geometry })}`,
    )
  return { origin, geometry }
}

async function reportBoundingSizes(page, selectors) {
  const sizes = await page.evaluate(
    (selectors) =>
      selectors.map((selector) => {
        const element = document.querySelector(selector)
        if (!(element instanceof HTMLElement))
          throw new Error(`measurement target missing: ${selector}`)
        const rect = element.getBoundingClientRect()
        const svg = element.querySelector('svg')?.getBoundingClientRect()
        return {
          selector,
          width: rect.width,
          height: rect.height,
          iconWidth: svg?.width,
          iconHeight: svg?.height,
        }
      }),
    selectors,
  )
  console.log(`composer sizes ${JSON.stringify(sizes)}`)
  for (const size of sizes) {
    if (Math.abs(size.width - 28) > 0.5 || Math.abs(size.height - 28) > 0.5)
      throw new Error(`${size.selector} is not 28px: ${JSON.stringify(size)}`)
    if (
      size.iconWidth !== undefined &&
      (Math.abs(size.iconWidth - 16) > 0.5 ||
        Math.abs(size.iconHeight - 16) > 0.5)
    )
      throw new Error(
        `${size.selector} icon is not 16px: ${JSON.stringify(size)}`,
      )
  }
}

async function assertHeaderActions(page, containerSelector) {
  const result = await page.evaluate((containerSelector) => {
    const container = document.querySelector(containerSelector)
    if (!(container instanceof HTMLElement))
      throw new Error('header actions missing')
    const buttons = [...container.querySelectorAll(':scope > button')]
    if (!buttons.length) throw new Error('header actions incomplete')
    const headerRect = container
      .closest('.detail-header')
      ?.getBoundingClientRect()
    return buttons.map((button, index) => {
      const rect = button.getBoundingClientRect()
      const badge = button.querySelector('.header-action-badge')
      const badgeRect = badge?.getBoundingClientRect()
      const nextRect = buttons[index + 1]?.getBoundingClientRect()
      return {
        width: rect.width,
        height: rect.height,
        background: getComputedStyle(button).backgroundColor,
        gap:
          nextRect && button.nextElementSibling === buttons[index + 1]
            ? nextRect.left - rect.right
            : undefined,
        badgeContained:
          badgeRect && headerRect
            ? badgeRect.top >= headerRect.top &&
              badgeRect.right <= headerRect.right
            : true,
        badgeOverlapsNext:
          badgeRect && nextRect
            ? badgeRect.right > nextRect.left && badgeRect.bottom > nextRect.top
            : false,
      }
    })
  }, containerSelector)
  for (const action of result) {
    if (Math.abs(action.width - 32) > 0.5 || Math.abs(action.height - 32) > 0.5)
      throw new Error(
        `header action is not a 32px visual box: ${JSON.stringify(action)}`,
      )
    if (action.background !== 'rgba(0, 0, 0, 0)')
      throw new Error('header action has a rest-state fill')
    if (action.gap !== undefined && (action.gap < 4 || action.gap > 8))
      throw new Error(`header action gap is ${action.gap}px`)
    if (!action.badgeContained)
      throw new Error('header action badge is clipped')
    if (action.badgeOverlapsNext)
      throw new Error('header action badge overlaps its neighbour')
  }
}

async function assertQuietHeaderState(page, expected) {
  const result = await page.evaluate(() => {
    const header = document.querySelector('.detail-header')
    const title = document.querySelector('.thread-heading')
    const actions = document.querySelector('.detail-actions')
    const crewButton = document.querySelector(
      '.detail-actions button[aria-label*="running"], .detail-actions button[aria-label^="Crew"]',
    )
    const crewIcon = crewButton?.querySelector('svg')
    const contextButton = document.querySelector('.context-ring')
    if (
      !(header instanceof HTMLElement) ||
      !(title instanceof HTMLElement) ||
      !(actions instanceof HTMLElement) ||
      !(crewButton instanceof HTMLElement) ||
      !(crewIcon instanceof SVGElement) ||
      !(contextButton instanceof HTMLElement)
    )
      throw new Error('quiet header controls missing')
    const titleRect = title.getBoundingClientRect()
    const actionsRect = actions.getBoundingClientRect()
    const dot = crewButton.querySelector('.crew-running-dot')
    return {
      badge: Boolean(document.querySelector('.header-action-badge')),
      crewActive: Boolean(dot),
      animatedDot: dot ? getComputedStyle(dot).animationName !== 'none' : false,
      iconWidth: crewIcon.getBoundingClientRect().width,
      hasContextLabel: Boolean(
        document.querySelector('.context-percent-label'),
      ),
      contextLevel:
        contextButton.parentElement?.getAttribute('data-level') ?? '',
      contextFill: getComputedStyle(
        contextButton.querySelector('.context-pie-value'),
      ).fill,
      titleOverlaps: titleRect.right > actionsRect.left + 0.5,
      crewWidth: crewButton.getBoundingClientRect().width,
      contextWidth: contextButton.getBoundingClientRect().width,
    }
  })
  if (result.badge) throw new Error('crew count badge is still present')
  if (result.hasContextLabel)
    throw new Error('context percentage label remains')
  if (result.crewActive !== expected.crewActive)
    throw new Error(`crew active state mismatch: ${JSON.stringify(result)}`)
  if (result.animatedDot)
    throw new Error(
      `crew running dot should be static: ${JSON.stringify(result)}`,
    )
  if (Math.abs(result.iconWidth - 17) > 0.5)
    throw new Error(`crew icon size mismatch: ${JSON.stringify(result)}`)
  if (result.contextLevel !== expected.level)
    throw new Error(`context level mismatch: ${JSON.stringify(result)}`)
  if (result.titleOverlaps)
    throw new Error(`header title overlaps actions: ${JSON.stringify(result)}`)
  if (
    Math.abs(result.crewWidth - 32) > 0.5 ||
    Math.abs(result.contextWidth - 32) > 0.5
  )
    throw new Error(`header action sizing mismatch: ${JSON.stringify(result)}`)
}

async function assertProjectGroupGeometry(page, root = '') {
  // Selected fill fades in over --dur-fast; measure the settled state.
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll(
        '.project-group.open, .project-group.open *',
      ),
    ].every((node) => node.getAnimations().length === 0),
  )
  const geometry = await page.evaluate((root) => {
    const scope = root ? document.querySelector(root) : document
    const group = scope?.querySelector('.project-group.open')
    const parent = group?.querySelector('.project-row')
    const action = group?.querySelector('.project-new-action')
    const child =
      group?.querySelector('.project-thread-row.selected') ??
      group?.querySelector('.project-thread-row')
    const parentText = parent?.querySelector('.project-row-copy > strong')
    const actionText = action?.lastChild
    const childText = child?.querySelector(':scope > span:first-child')
    if (
      !(group instanceof HTMLElement) ||
      !(parent instanceof HTMLElement) ||
      !(action instanceof HTMLElement) ||
      !(child instanceof HTMLElement) ||
      !(parentText instanceof HTMLElement) ||
      !(actionText instanceof Text) ||
      !(childText instanceof HTMLElement)
    )
      throw new Error('project group assertion target missing')
    child.classList.add('selected')
    child.setAttribute('aria-current', 'page')
    const groupRect = group.getBoundingClientRect()
    const actionRect = action.getBoundingClientRect()
    const childRect = child.getBoundingClientRect()
    const actionRange = document.createRange()
    actionRange.selectNode(actionText)
    const groupStyle = getComputedStyle(group)
    const childStyle = getComputedStyle(child)
    return {
      groupBackground: groupStyle.backgroundColor,
      groupRadius: Number.parseFloat(groupStyle.borderRadius),
      childBackground: childStyle.backgroundColor,
      childRadius: Number.parseFloat(childStyle.borderRadius),
      leftGap: childRect.left - groupRect.left,
      rightGap: groupRect.right - childRect.right,
      actionHeight: actionRect.height,
      childHeight: childRect.height,
      parentTextLeft: parentText.getBoundingClientRect().left,
      actionTextLeft: action.querySelector('svg').getBoundingClientRect().left,
      childTextLeft: childText.getBoundingClientRect().left,
    }
  }, root)
  if (
    geometry.groupBackground === 'rgba(0, 0, 0, 0)' ||
    geometry.childBackground === 'rgba(0, 0, 0, 0)'
  )
    throw new Error(`project surfaces missing: ${JSON.stringify(geometry)}`)
  if (geometry.leftGap < 4 || geometry.rightGap < 4)
    throw new Error(`project child gaps failed: ${JSON.stringify(geometry)}`)
  // The row uses the group's explicit 4px inner inset; measured geometry also
  // includes the group's padding and hairline.
  if (
    Math.abs(geometry.childRadius - Math.max(geometry.groupRadius - 4, 4)) > 1
  )
    throw new Error(
      `project radii are not concentric: ${JSON.stringify(geometry)}`,
    )
  if (Math.abs(geometry.actionHeight - geometry.childHeight) > 0.5)
    throw new Error(`project action height failed: ${JSON.stringify(geometry)}`)
  if (Math.abs(geometry.parentTextLeft - geometry.childTextLeft) > 1)
    throw new Error(`project child indent failed: ${JSON.stringify(geometry)}`)
  if (Math.abs(geometry.actionTextLeft - geometry.childTextLeft) > 1)
    throw new Error(
      `project action alignment failed: ${JSON.stringify(geometry)}`,
    )
  await assertNoHorizontalOverflow(
    page,
    root ? `${root} .threads-page-body` : '.threads-page-body',
  )
}

async function assertNavigationWithoutInbox(page, selector) {
  // The two-pane rail is icon-only; its names live in aria-label.
  const labels = await page
    .locator(`${selector} a`)
    .evaluateAll((links) =>
      links.map(
        (link) => link.getAttribute('aria-label') ?? link.textContent ?? '',
      ),
    )
  const normalized = labels.map((label) => label.trim())
  if (normalized.includes('Inbox'))
    throw new Error(`Inbox remains in navigation: ${JSON.stringify(labels)}`)
  const expected =
    selector === '.tab-bar'
      ? ['Threads', 'Herdr', 'Settings']
      : ['Threads', 'GTD', 'Herdr', 'Settings']
  const roots = normalized.filter((label) => expected.includes(label))
  if (
    (selector === '.tab-bar' && normalized.join('|') !== expected.join('|')) ||
    roots.join('|') !== expected.join('|')
  )
    throw new Error(
      `${selector} navigation roots: ${JSON.stringify(normalized)}`,
    )
}

async function assertRecipeDismissPolicy(page) {
  const banner = page.locator('.recipe-banner')
  await banner.waitFor()
  await banner.getByRole('button', { name: 'Extract', exact: true }).click()
  await banner.waitFor({ state: 'detached' })
  if (await page.locator('.recipe-banner').count())
    throw new Error('recipe banner remained after extract')
  await page.evaluate(() => {
    const url = new URL(location.href)
    url.searchParams.delete('recipeReady')
    history.replaceState(null, '', url)
  })
  await page.reload()
  await page.locator('.detail-header').waitFor()
  await page.waitForTimeout(700)
  if (await page.locator('.recipe-banner').count())
    throw new Error('recipe banner returned after reload')
}

const setFixtureTheme = async (page, theme, mode) => {
  await page.evaluate(
    ({ theme, mode }) => {
      localStorage.setItem(
        'alma-mobile.theme.v1',
        JSON.stringify({
          mode,
          dark: mode === 'dark' ? theme : 'palenight',
          light: mode === 'light' ? theme : 'one_light',
        }),
      )
    },
    { theme, mode },
  )
  await page.reload()
}

async function assertStopRingInsideViewport(page, margin = 8) {
  const geometry = await page.locator('.stop-hold-ring').evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: innerWidth,
      height: innerHeight,
    }
  })
  if (
    geometry.left < margin - 1 ||
    geometry.top < margin - 1 ||
    geometry.right > geometry.width - margin + 1 ||
    geometry.bottom > geometry.height - margin + 1
  )
    throw new Error(
      `stop ring escaped viewport margin: ${JSON.stringify(geometry)}`,
    )
}

async function assertStopHintPlacement(page) {
  await page.waitForTimeout(180)
  const geometry = await page.evaluate(() => {
    const hint = document.querySelector('.stop-hold-hint.visible')
    const pane = document.querySelector('.thread-detail')
    const activity = document.querySelector('.activity-bar')
    if (
      !(hint instanceof HTMLElement) ||
      !(pane instanceof HTMLElement) ||
      !(activity instanceof HTMLElement)
    )
      throw new Error('stop hint geometry target missing')
    const hintRect = hint.getBoundingClientRect()
    const paneRect = pane.getBoundingClientRect()
    const activityRect = activity.getBoundingClientRect()
    return {
      hintCenter: hintRect.left + hintRect.width / 2,
      paneCenter: paneRect.left + paneRect.width / 2,
      hintBottom: hintRect.bottom,
      activityTop: activityRect.top,
      fontSize: Number.parseFloat(getComputedStyle(hint).fontSize),
    }
  })
  if (Math.abs(geometry.hintCenter - geometry.paneCenter) > 1)
    throw new Error(`stop hint not pane-centered: ${JSON.stringify(geometry)}`)
  if (geometry.activityTop - geometry.hintBottom < 12)
    throw new Error(`stop hint gap too small: ${JSON.stringify(geometry)}`)
  if (geometry.fontSize < 13 || geometry.fontSize > 14)
    throw new Error(`stop hint text size wrong: ${JSON.stringify(geometry)}`)
  console.log('stop-hint geometry', JSON.stringify(geometry))
}

async function assertQueueDragShadowContained(page) {
  const geometry = await page.evaluate(() => {
    const scroll = document.querySelector('.queue-scroll')
    const row = document.querySelector('.queue-item.dragging')
    if (!(scroll instanceof HTMLElement) || !(row instanceof HTMLElement))
      throw new Error('queue shadow geometry target missing')
    const scrollRect = scroll.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const style = getComputedStyle(row)
    const shadow = style.boxShadow.split(',')[0]
    const lengths =
      shadow.match(/-?\d+(?:\.\d+)?px/g)?.map(Number.parseFloat) ?? []
    const blur = lengths[2] ?? 0
    const spread = lengths[3] ?? 0
    const horizontalExtent = Math.max(0, blur + spread)
    return {
      scrollLeft: scrollRect.left,
      scrollRight: scrollRect.right,
      rowLeft: rowRect.left,
      rowRight: rowRect.right,
      horizontalExtent,
      leftEdge: rowRect.left - horizontalExtent,
      rightEdge: rowRect.right + horizontalExtent,
    }
  })
  if (
    geometry.leftEdge < geometry.scrollLeft - 0.5 ||
    geometry.rightEdge > geometry.scrollRight + 0.5
  )
    throw new Error(`queue drag shadow clipped: ${JSON.stringify(geometry)}`)
  console.log('queue-drag geometry', JSON.stringify(geometry))
}

async function assertComposerSpacing(page, kind) {
  const geometry = await page.evaluate(() => {
    const shell = document.querySelector(
      '.split-start-composer, .composer-shell',
    )
    const composer = shell?.querySelector('.composer')
    const textarea = composer?.querySelector('textarea')
    const controls = composer?.querySelector('.composer-controls')
    const attach = composer?.querySelector('.attach')
    const send = composer?.querySelector('.send')
    if (
      !(shell instanceof HTMLElement) ||
      !(composer instanceof HTMLElement) ||
      !(textarea instanceof HTMLElement) ||
      !(controls instanceof HTMLElement) ||
      !(attach instanceof HTMLElement) ||
      !(send instanceof HTMLElement)
    )
      throw new Error('composer geometry target missing')
    const shellRect = shell.getBoundingClientRect()
    const textareaRect = textarea.getBoundingClientRect()
    const controlsRect = controls.getBoundingClientRect()
    const attachRect = attach.getBoundingClientRect()
    const sendRect = send.getBoundingClientRect()
    const shellStyle = getComputedStyle(shell)
    const borderLeft = Number.parseFloat(shellStyle.borderLeftWidth)
    const borderRight = Number.parseFloat(shellStyle.borderRightWidth)
    const borderBottom = Number.parseFloat(shellStyle.borderBottomWidth)
    return {
      bottomGap: shellRect.bottom - borderBottom - controlsRect.bottom,
      leftGap: attachRect.left - (shellRect.left + borderLeft),
      rightGap: shellRect.right - borderRight - sendRect.right,
      textareaTextLeft:
        textareaRect.left +
        Number.parseFloat(getComputedStyle(textarea).paddingLeft),
      attachVisualLeft: attachRect.left,
      attachHitWidth: attachRect.width + 12,
      sendHitWidth: sendRect.width + 12,
    }
  })
  if (kind.startsWith('start')) {
    for (const side of ['leftGap', 'rightGap'])
      if (geometry[side] < 8 || geometry[side] > 10)
        throw new Error(
          `${kind} composer ${side} wrong: ${JSON.stringify(geometry)}`,
        )
  } else {
    for (const side of ['leftGap', 'rightGap'])
      if (geometry[side] < 8 || geometry[side] > 10)
        throw new Error(
          `${kind} composer ${side} wrong: ${JSON.stringify(geometry)}`,
        )
  }
  if (geometry.bottomGap < 7 || geometry.bottomGap > 9)
    throw new Error(
      `${kind} composer bottom gap wrong: ${JSON.stringify(geometry)}`,
    )
  if (geometry.attachHitWidth < 40 || geometry.sendHitWidth < 40)
    throw new Error(
      `${kind} composer hit target too small: ${JSON.stringify(geometry)}`,
    )
  console.log(`composer-spacing ${kind}`, JSON.stringify(geometry))
  globalThis.__composerSpacing ??= {}
  globalThis.__composerSpacing[kind] = geometry
}

async function assertQueueHeight(page) {
  const geometry = await page.locator('.queue-panel').evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return { height: rect.height, viewportHeight: innerHeight }
  })
  if (geometry.height > geometry.viewportHeight * 0.35 + 1)
    throw new Error(`queue panel too tall: ${JSON.stringify(geometry)}`)
}

async function assertStopRing(page, holding) {
  const state = await page.locator('.stop-hold-ring').evaluate((node) => {
    const style = getComputedStyle(node)
    const transform = new DOMMatrixReadOnly(style.transform)
    return {
      opacity: Number(style.opacity),
      scale: Math.hypot(transform.a, transform.b),
    }
  })
  if (holding) {
    if (state.opacity < 0.9 || state.scale < 2)
      throw new Error(`pressed stop ring failed: ${JSON.stringify(state)}`)
  } else if (state.opacity > 0.05 || Math.abs(state.scale - 1) > 0.05) {
    throw new Error(`resting stop ring failed: ${JSON.stringify(state)}`)
  }
}

const scrollFixtureBody = async (page, selector) => {
  await page.locator(selector).evaluate((node) => {
    node.scrollTop = 420
  })
}

const holdStopWithTouch = async (page, duration) => {
  const box = await page.locator('.activity-bar-stop').boundingBox()
  if (!box) throw new Error('stop button missing')
  const cdp = await page.context().newCDPSession(page)
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  })
  await page.waitForTimeout(duration)
  return cdp
}

const asserttaskCardsLayout = async (page) => {
  const layout = await page.evaluate(() => {
    const message = document.querySelector('.message-area')
    const composer = document.querySelector('.composer-shell')
    const todo = document.querySelector('.todo-progress')
    if (!(message instanceof HTMLElement) || !(composer instanceof HTMLElement))
      throw new Error('task-card layout targets missing')
    const messageOverflow = message.scrollWidth - message.clientWidth
    const composerBox = composer.getBoundingClientRect()
    const todoBox = todo?.getBoundingClientRect()
    return {
      messageOverflow,
      composerLeft: composerBox.left,
      composerRight: composerBox.right,
      todoLeft: todoBox?.left,
      todoRight: todoBox?.right,
    }
  })
  if (layout.messageOverflow > 1)
    throw new Error(`message column overflowed by ${layout.messageOverflow}px`)
  if (
    layout.todoLeft !== undefined &&
    (Math.abs(layout.todoLeft - layout.composerLeft) > 1 ||
      Math.abs(layout.composerRight - layout.todoRight) > 1)
  )
    throw new Error('todo bar is not aligned with composer edges')
}

const asserttaskCardsTaskExpanded = async (page) => {
  await asserttaskCardsLayout(page)
  const task = page
    .locator('.tool-card')
    .filter({ hasText: 'Accessibility review' })
    .first()
  if ((await task.locator('pre').count()) !== 0)
    throw new Error('expanded Task exposed raw JSON')
  if (!(await task.getByText('Review complete').isVisible()))
    throw new Error('expanded Task markdown result missing')
}

const asserttaskCardsFooter = async (page) => {
  await asserttaskCardsLayout(page)
  await assertNoHorizontalOverflow(page, '.message-footer')
  const footer = await page
    .locator('.message-footer', { has: page.locator('.usage-footer') })
    .evaluate((node) => {
      const usage = node.querySelector('.usage-footer')
      const actions = node.querySelector('.message-actions-button')
      const message = node.closest('.message')
      const endReason = node.querySelector('.turn-end-reason')
      if (
        !(usage instanceof HTMLElement) ||
        !(actions instanceof HTMLElement) ||
        !(message instanceof HTMLElement) ||
        !(endReason instanceof HTMLElement)
      )
        throw new Error('reply footer targets missing')
      const usageBox = usage.getBoundingClientRect()
      const actionsBox = actions.getBoundingClientRect()
      const messageBox = message.getBoundingClientRect()
      const messageStyle = getComputedStyle(message)
      const endReasonBox = endReason.getBoundingClientRect()
      const endReasonStyle = getComputedStyle(endReason)
      return {
        usageCenter: usageBox.top + usageBox.height / 2,
        actionsCenter: actionsBox.top + actionsBox.height / 2,
        actionsRight: actionsBox.right,
        contentRight:
          messageBox.right - Number.parseFloat(messageStyle.paddingRight),
        endReasonHeight: endReasonBox.height,
        endReasonLineHeight: Number.parseFloat(endReasonStyle.lineHeight),
      }
    })
  if (Math.abs(footer.usageCenter - footer.actionsCenter) > 1)
    throw new Error(`reply footer centres differ: ${JSON.stringify(footer)}`)
  if (Math.abs(footer.actionsRight - footer.contentRight) > 1)
    throw new Error(`reply action edge differs: ${JSON.stringify(footer)}`)
  if (footer.endReasonHeight > footer.endReasonLineHeight + 1)
    throw new Error(`end reason wrapped: ${JSON.stringify(footer)}`)
}

const prepareRunningTask = async (page) => {
  const card = page.locator('.tool-card.running').first()
  const duration = card.locator('.tool-duration')
  const before = await duration.textContent()
  await page.waitForTimeout(1_050)
  const after = await duration.textContent()
  if (before === after)
    throw new Error(`running Task duration did not tick from ${before}`)
  if ((await card.locator('.loading-orb').count()) !== 1)
    throw new Error('running Task spinner missing')

  const todo = page
    .locator('.tool-card')
    .filter({ hasText: 'TodoWrite' })
    .first()
  await todo.locator('.tool-summary').click()
  if ((await todo.locator('.todo-list .todo-item').count()) !== 3)
    throw new Error('expanded TodoWrite checklist missing')
  if ((await todo.locator('pre').count()) !== 0)
    throw new Error('expanded TodoWrite exposed raw JSON')
  await todo.locator('.tool-summary').click()

  await card.scrollIntoViewIfNeeded()
  await page.evaluate(() => new Promise(requestAnimationFrame))
  const geometry = await card.evaluate((node) => {
    const header = node.querySelector('.tool-summary')
    const activity = node.querySelector('.tool-activity')
    if (!(header instanceof HTMLElement) || !(activity instanceof HTMLElement))
      throw new Error('running Task header or activity missing')
    const viewportHeight = window.innerHeight
    const inside = (element) => {
      const box = element.getBoundingClientRect()
      return box.top >= 0 && box.bottom <= viewportHeight
    }
    return { headerInside: inside(header), activityInside: inside(activity) }
  })
  if (!geometry.headerInside || !geometry.activityInside)
    throw new Error(
      `running Task is outside viewport: ${JSON.stringify(geometry)}`,
    )
}

const taskCardsShots = [
  {
    file: 'taskCards-running-task-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.tool-activity',
    act: prepareRunningTask,
    afterCapture: asserttaskCardsLayout,
  },
  {
    file: 'taskCards-running-task-two-pane.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-gen`,
    ready: '.tool-activity',
    act: prepareRunningTask,
    afterCapture: asserttaskCardsLayout,
  },
  {
    file: 'taskCards-task-markdown-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-taskCards-complete`,
    ready: '.tool-card.done',
    async act(page) {
      await page.locator('.tool-summary').click()
    },
    afterCapture: asserttaskCardsTaskExpanded,
  },
  {
    file: 'taskCards-task-markdown-two-pane.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-taskCards-complete`,
    ready: '.tool-card.done',
    async act(page) {
      await page.locator('.tool-summary').click()
    },
    afterCapture: asserttaskCardsTaskExpanded,
  },
  {
    file: 'taskCards-todo-sheet-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.todo-progress',
    async act(page) {
      await page.locator('.todo-progress').click()
    },
    afterCapture: asserttaskCardsLayout,
  },
  {
    file: 'taskCards-todo-sheet-two-pane.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-gen`,
    ready: '.todo-progress',
    async act(page) {
      await page.locator('.todo-progress').click()
    },
    afterCapture: asserttaskCardsLayout,
  },
  {
    file: 'taskCards-durations-usage-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-taskCards-complete`,
    ready: '.worked-duration',
    afterCapture: asserttaskCardsFooter,
  },
  {
    file: 'taskCards-durations-usage-two-pane.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-taskCards-complete`,
    ready: '.worked-duration',
    afterCapture: asserttaskCardsFooter,
  },
  {
    file: 'theme-scales-footer-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-taskCards-complete`,
    ready: '.worked-duration',
    afterCapture: asserttaskCardsFooter,
  },
  {
    file: 'theme-scales-footer-two-pane.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-taskCards-complete`,
    ready: '.worked-duration',
    afterCapture: asserttaskCardsFooter,
  },
]

const fileShot = ({ file, viewport, link, ready }) => ({
  file,
  viewport,
  reducedMotion: 'no-preference',
  route: `${DESKTOP}/t-files`,
  ready: '.markdown-content a',
  async act(page) {
    const before = new URL(page.url()).searchParams.get('route')
    await page.getByText(link, { exact: true }).click()
    await page.locator(ready).waitFor({ timeout: 15_000 })
    const after = new URL(page.url()).searchParams.get('route')
    if (after !== before)
      throw new Error(`${file}: file link navigated from ${before} to ${after}`)
  },
})

const htmlShot = ({ file, viewport, fullscreen = false, source = false }) => {
  const base = fileShot({
    file,
    viewport,
    link: 'Launch page',
    ready: '.html-preview',
  })
  return {
    ...base,
    reducedMotion: 'no-preference',
    async act(page) {
      await base.act(page)
      const frame = page.locator('.html-preview-frame').first()
      const sandbox = (await frame.getAttribute('sandbox')) ?? ''
      if (sandbox.split(/\s+/).includes('allow-same-origin'))
        throw new Error(`${file}: tier-1 iframe must not allow same origin`)
      const probe = page
        .frameLocator('.html-preview-frame')
        .first()
        .locator('#probe')
      await probe.filter({ hasText: 'parent storage:' }).waitFor()
      const text = await probe.textContent()
      if (!text?.includes('isolated'))
        throw new Error(`${file}: preview reached parent storage (${text})`)
      if (source) {
        await page.getByRole('tab', { name: /source/i }).click()
        await page.locator('.file-link-text').waitFor()
      }
      if (fullscreen) {
        await page.getByRole('button', { name: 'Full screen' }).click()
        await page.locator('.html-preview-fullscreen').waitFor()
        await page.waitForTimeout(450)
        const box = await page
          .locator('.html-preview-fullscreen .html-preview-frame')
          .boundingBox()
        const vp = page.viewportSize()
        if (!box || box.width < vp.width - 2)
          throw new Error(`${file}: full-screen preview is not full width`)
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
      if (overflow) throw new Error(`${file}: horizontal overflow`)
    },
  }
}

const markdownShot = ({
  file,
  viewport,
  fullscreen = false,
  source = false,
}) => {
  const base = fileShot({
    file,
    viewport,
    link: 'Release notes',
    ready: '.markdown-file-preview',
  })
  return {
    ...base,
    reducedMotion: 'no-preference',
    async act(page) {
      await base.act(page)
      if (source) {
        await page.getByRole('tab', { name: /source/i }).click()
        await page.locator('.file-link-text').waitFor()
      } else {
        const image = page.locator('.markdown-file-content img').first()
        await image.waitFor({ timeout: 15_000 })
        const naturalWidth = await image.evaluate((node) => node.naturalWidth)
        if (naturalWidth <= 0)
          throw new Error(`${file}: local image did not load`)
        for (const selector of [
          '.markdown-file-content .markdown-table-wrap',
          '.markdown-file-content pre',
        ]) {
          const bounded = await page
            .locator(selector)
            .first()
            .evaluate((node) => {
              const container = node.closest('.markdown-file-content')
              if (!container) return false
              const itemBox = node.getBoundingClientRect()
              const containerBox = container.getBoundingClientRect()
              return (
                itemBox.left >= containerBox.left - 1 &&
                itemBox.right <= containerBox.right + 1 &&
                getComputedStyle(node).overflowX === 'auto'
              )
            })
          if (!bounded)
            throw new Error(`${file}: table or code escaped its inner scroller`)
        }
        const before = new URL(page.url()).searchParams.get('route')
        await page.getByRole('link', { name: 'linked brief' }).click()
        await page.getByRole('heading', { name: 'Linked brief' }).waitFor()
        const after = new URL(page.url()).searchParams.get('route')
        if (after !== before)
          throw new Error(`${file}: relative link navigated the route`)
        await page
          .locator('.file-link-sheet')
          .getByRole('button', { name: 'Back', exact: true })
          .click()
        await page.getByRole('heading', { name: 'Markdown preview' }).waitFor()
      }
      if (fullscreen) {
        await page.getByRole('button', { name: 'Full screen' }).click()
        await page.locator('.markdown-preview-fullscreen').waitFor()
        await page.waitForTimeout(450)
        const box = await page
          .locator('.markdown-preview-fullscreen .markdown-file-content')
          .boundingBox()
        const vp = page.viewportSize()
        if (!box || box.width < vp.width - 2)
          throw new Error(`${file}: full-screen preview is not full width`)
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
      if (overflow) throw new Error(`${file}: horizontal overflow`)
    },
  }
}

const endResourcesShot = ({ file, viewport }) => ({
  file,
  viewport,
  reducedMotion: 'no-preference',
  route: `${DESKTOP}/t-end-resources`,
  ready: '.end-resource-card',
  async act(page) {
    await page.locator('.end-resource-card').last().scrollIntoViewIfNeeded()
    const cards = page.locator('.end-resource-card')
    if ((await cards.count()) !== 5)
      throw new Error(`${file}: expected 5 deduped resource cards`)
    const threadUrl = page.url()
    await cards.first().click()
    await page.locator('.file-link-sheet').waitFor()
    if (page.url() !== threadUrl)
      throw new Error(`${file}: card click navigated away`)
    await page
      .locator('.file-link-sheet')
      .getByRole('button', { name: 'Close' })
      .click()
    await page.locator('a.markdown-file-path').click()
    await page.locator('.file-link-sheet').waitFor()
    if (page.url() !== threadUrl)
      throw new Error(`${file}: inline path click navigated away`)
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      )
    )
      throw new Error(`${file}: horizontal overflow`)
  },
})

const threadFilesShot = ({ file, viewport, stopAtDiff = false }) => ({
  file,
  viewport,
  reducedMotion: 'no-preference',
  route: `${DESKTOP}/t-end-resources`,
  ready: '.thread-detail',
  async act(page) {
    await page.getByRole('button', { name: 'Thread menu' }).click()
    await page.getByRole('menuitem', { name: /Files/ }).click()
    const sheet = page.locator('.thread-files-sheet')
    await sheet.waitFor()
    await sheet.getByRole('button', { name: 'Show all 14' }).click()
    await page.waitForTimeout(80)
    await assertNoHorizontalOverflow(page, '.thread-files-sheet')
    const rowText = await sheet.locator('.thread-files-row').first().innerText()
    if (rowText.includes('/home/'))
      throw new Error(`${file}: changed row exposed an absolute path`)
    if (!/\b(?:\d+s|\d+m|\d+h|\d+d|\d+mo)\b/.test(rowText))
      throw new Error(`${file}: changed row has no compact timestamp`)
    const threadUrl = page.url()
    await sheet.locator('.thread-files-row').first().click()
    const changes = page.locator('.file-changes-sheet')
    await changes.waitFor()
    await assertNoHorizontalOverflow(page, '.file-changes-sheet')
    const diffText = await changes.locator('.file-diff').first().innerText()
    if (!diffText.includes('+') || !diffText.includes('−'))
      throw new Error(`${file}: diff view is missing added or deleted lines`)
    if (stopAtDiff) {
      await page.waitForTimeout(400)
      return
    }
    if (page.url() !== threadUrl)
      throw new Error(`${file}: changed file click navigated away`)
    await page.evaluate(() => window.__closeTopOverlay?.())
    await changes.waitFor({ state: 'detached' })
    await sheet.waitFor()
    if (page.url() !== threadUrl)
      throw new Error(`${file}: Back from diff changed the route`)
    await page.evaluate(() => window.__closeTopOverlay?.())
    await sheet.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: 'Thread menu' }).click()
    await page.getByRole('menuitem', { name: /Files/ }).click()
    await page.locator('.thread-files-sheet').waitFor()
    await page
      .locator('.thread-files-sheet')
      .getByRole('button', { name: 'Show all 14' })
      .click()
  },
})

const codeCopyShot = ({ file, viewport }) => ({
  file,
  viewport,
  reducedMotion: 'no-preference',
  route: `${DESKTOP}/t-long`,
  ready: '.code-block',
  async act(page) {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    const block = page.locator('.code-block').first()
    await block.scrollIntoViewIfNeeded()
    const before = page.url()
    await block.getByRole('button', { name: 'Copy code' }).click()
    await block.getByRole('button', { name: 'Copied code' }).waitFor()
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    const expected = await block
      .locator('pre')
      .evaluate((pre) => (pre.textContent ?? '').replace(/\n$/, ''))
    if (copied !== expected || !copied.includes('applyInsets'))
      throw new Error(`${file}: copied ${JSON.stringify(copied)}`)
    if (page.url() !== before) throw new Error(`${file}: copy navigated`)
    const geometry = await block.evaluate((node) => {
      const header = node.querySelector('.code-block-header')
      const button = node.querySelector('.code-block-copy')
      const box = node.getBoundingClientRect()
      const b = button.getBoundingClientRect()
      return {
        headerOverflow: header.scrollWidth > header.clientWidth + 1,
        buttonInside: b.right <= box.right + 0.5 && b.left >= box.left,
        pageOverflow:
          document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    if (
      geometry.headerOverflow ||
      !geometry.buttonInside ||
      geometry.pageOverflow
    )
      throw new Error(`${file}: ${JSON.stringify(geometry)}`)
  },
})

const screenShots = [
  {
    file: 'screen-view-en-412.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/screen',
    query: 'lang=en',
    ready: '.remote-screen-media',
    safeInsets: true,
    afterCapture: (page) =>
      assertNoHorizontalOverflow(page, '.remote-screen-page'),
  },
  {
    file: 'screen-asleep-zh-412.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/screen',
    query: 'lang=zh&screenState=asleep',
    ready: '.remote-screen-asleep',
    safeInsets: true,
    afterCapture: (page) =>
      assertNoHorizontalOverflow(page, '.remote-screen-page'),
  },
  {
    file: 'screen-view-zh-412.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/screen',
    query: 'lang=zh',
    ready: '.remote-screen-media',
    safeInsets: true,
    afterCapture: (page) =>
      assertNoHorizontalOverflow(page, '.remote-screen-page'),
  },
  {
    file: 'screen-control-zh-412.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/screen',
    query: 'lang=zh',
    ready: '.remote-screen-media',
    safeInsets: true,
    act: async (page) => {
      await page.getByRole('button', { name: '控制', exact: true }).click()
      await page.getByRole('button', { name: '触控板', exact: true }).click()
      await page.getByRole('button', { name: '键盘', exact: true }).click()
    },
    afterCapture: (page) =>
      assertNoHorizontalOverflow(page, '.remote-screen-page'),
  },
  {
    file: 'screen-control-en-412.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/screen',
    query: 'lang=en',
    ready: '.remote-screen-media',
    safeInsets: true,
    act: async (page) => {
      await page.getByRole('button', { name: 'Control', exact: true }).click()
      await page.getByRole('button', { name: 'Trackpad', exact: true }).click()
      await page.getByRole('button', { name: 'Keyboard', exact: true }).click()
    },
    afterCapture: (page) =>
      assertNoHorizontalOverflow(page, '.remote-screen-page'),
  },
  {
    file: 'screen-view-en-884.png',
    viewport: TABLET,
    route: '/d/fixture-desktop/screen',
    query: 'lang=en',
    ready: '.remote-screen-media',
    safeInsets: true,
    afterCapture: (page) =>
      assertNoHorizontalOverflow(page, '.remote-screen-page'),
  },
]

const shots = [
  {
    file: 'zh-settings-360.png',
    viewport: { width: 360, height: 800 },
    route: '/settings',
    query: 'lang=zh',
    ready: '.settings-switch',
  },
  {
    file: 'zh-threads-360.png',
    viewport: { width: 360, height: 800 },
    route: DESKTOP,
    query: 'lang=zh',
    ready: '.thread-tabs[data-tab-ready="true"]',
  },
  codeCopyShot({
    file: 'code-copy-360.png',
    viewport: { width: 360, height: 800 },
  }),
  codeCopyShot({
    file: 'code-copy-884.png',
    viewport: { width: 884, height: 900 },
  }),
  threadFilesShot({
    file: 'thread-files-360.png',
    viewport: { width: 360, height: 800 },
  }),
  threadFilesShot({
    file: 'thread-files-884.png',
    viewport: { width: 884, height: 900 },
  }),
  threadFilesShot({
    file: 'thread-file-diff-360.png',
    viewport: { width: 360, height: 800 },
    stopAtDiff: true,
  }),
  threadFilesShot({
    file: 'thread-file-diff-884.png',
    viewport: { width: 884, height: 900 },
    stopAtDiff: true,
  }),
  endResourcesShot({
    file: 'end-resources-360.png',
    viewport: { width: 360, height: 800 },
  }),
  endResourcesShot({
    file: 'end-resources-884.png',
    viewport: { width: 884, height: 900 },
  }),
  markdownShot({ file: 'md-preview-360.png', viewport: FILE_PHONE }),
  markdownShot({ file: 'md-preview-884.png', viewport: TABLET }),
  markdownShot({
    file: 'md-preview-source-360.png',
    viewport: FILE_PHONE,
    source: true,
  }),
  markdownShot({
    file: 'md-preview-fullscreen-360.png',
    viewport: FILE_PHONE,
    fullscreen: true,
  }),
  htmlShot({ file: 'html-preview-sheet-360.png', viewport: FILE_PHONE }),
  htmlShot({
    file: 'html-preview-source-360.png',
    viewport: FILE_PHONE,
    source: true,
  }),
  htmlShot({
    file: 'html-preview-fullscreen-360.png',
    viewport: FILE_PHONE,
    fullscreen: true,
  }),
  htmlShot({ file: 'html-preview-sheet-884.png', viewport: TABLET }),
  htmlShot({
    file: 'html-preview-fullscreen-884.png',
    viewport: TABLET,
    fullscreen: true,
  }),
  fileShot({
    file: 'files-docx-sheet-360.png',
    viewport: FILE_PHONE,
    link: 'Release brief',
    ready: '.file-link-state',
  }),
  fileShot({
    file: 'files-text-preview-360.png',
    viewport: FILE_PHONE,
    link: 'Release notes',
    ready: '.file-link-text',
  }),
  fileShot({
    file: 'files-image-preview-884.png',
    viewport: TABLET,
    link: 'Interface preview',
    ready: '.file-link-image',
  }),
  fileShot({
    file: 'files-error-884.png',
    viewport: TABLET,
    link: 'Missing export',
    ready: '.file-link-state.error',
  }),
  {
    file: 'split-history.png',
    viewport: TABLET,
    route: DESKTOP,
    query: 'trackHistory=1',
    ready: '.split-sidebar .thread-row',
    async act(page) {
      const initialLength = await page.evaluate(() => history.length)
      for (const title of [
        'Tablet layout and timeline',
        'Context window budget',
        'Release checklist',
      ]) {
        await page
          .locator('.split-sidebar .thread-row')
          .filter({ hasText: title })
          .click()
        await page.waitForURL(/\/threads\/[^/]+$/)
        const length = await page.evaluate(() => history.length)
        if (length !== initialLength + 1)
          throw new Error(
            `thread switch grew history: ${length} from ${initialLength}`,
          )
      }
      await page.setViewportSize({ width: 360, height: 800 })
      await page.evaluate(() => history.back())
      await page.waitForURL(/\/threads$/)
      if (!page.url().endsWith('/d/fixture-desktop/threads'))
        throw new Error(`back did not land on thread list: ${page.url()}`)
    },
  },
  {
    file: 'hold-to-stop-stop-hint-phone.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    hasTouch: true,
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar-stop',
    async act(page) {
      const cdp = await holdStopWithTouch(page, 180)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
      await page.locator('.stop-hold-hint.visible').waitFor()
      await assertStopHintPlacement(page)
    },
  },
  {
    file: 'hold-to-stop-stop-ring-phone.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    hasTouch: true,
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar-stop',
    async act(page) {
      await holdStopWithTouch(page, 900)
      await assertStopRing(page, true)
      await assertStopRingInsideViewport(page)
    },
  },
  {
    file: 'hold-to-stop-stop-hint-two-pane.png',
    viewport: TAB_TWO_PANE,
    reducedMotion: 'no-preference',
    hasTouch: true,
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar-stop',
    async act(page) {
      const cdp = await holdStopWithTouch(page, 180)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
      await page.locator('.stop-hold-hint.visible').waitFor()
      await assertStopHintPlacement(page)
    },
  },
  {
    file: 'hold-to-stop-stop-ring-two-pane.png',
    viewport: TABLET,
    reducedMotion: 'no-preference',
    hasTouch: true,
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar-stop',
    async act(page) {
      await holdStopWithTouch(page, 900)
      await assertStopRing(page, true)
      await assertStopRingInsideViewport(page)
    },
  },
  {
    file: 'hold-to-stop-queue-mid-drag.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    hasTouch: true,
    route: `${DESKTOP}/t-queue`,
    query: 'queueCount=5',
    ready: '.queue-item',
    async act(page) {
      const rows = page.locator('.queue-item')
      const first = await rows.nth(0).boundingBox()
      const fourth = await rows.nth(3).boundingBox()
      if (!first || !fourth) throw new Error('queue drag rows missing')
      const cdp = await page.context().newCDPSession(page)
      const start = { x: first.x + 18, y: first.y + first.height / 2 }
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [start],
      })
      await page.locator('.queue-item.dragging').waitFor({ timeout: 1000 })
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: start.x, y: fourth.y + fourth.height / 2 }],
      })
      await page.waitForTimeout(90)
      await assertQueueDragShadowContained(page)
    },
  },
  {
    file: 'hold-to-stop-composer-thread-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-long`,
    ready: '.composer',
    async act(page) {
      await assertComposerSpacing(page, 'thread-phone')
    },
  },
  {
    file: 'hold-to-stop-composer-start-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}?new=1`,
    ready: '.split-start-composer .composer',
    async act(page) {
      await assertComposerSpacing(page, 'start-phone')
    },
  },
  {
    file: 'hold-to-stop-composer-thread-two-pane.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-long`,
    ready: '.composer',
    async act(page) {
      await assertComposerSpacing(page, 'thread-two-pane')
    },
  },
  {
    file: 'hold-to-stop-composer-start-two-pane.png',
    viewport: TABLET,
    route: DESKTOP,
    ready: '.split-start-composer .composer',
    async act(page) {
      await assertComposerSpacing(page, 'start-two-pane')
    },
  },
  {
    file: 'overlays-bottom-sheet-open.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.composer .attach',
    async act(page) {
      await page.getByRole('button', { name: 'Add attachment' }).click()
      const dialog = page.getByRole('dialog', { name: 'Add attachment' })
      await dialog.waitFor()
      await page.waitForFunction(() => {
        const node = document.querySelector(
          '[role="dialog"][aria-label="Add attachment"]',
        )
        if (!(node instanceof HTMLElement)) return false
        const rect = node.getBoundingClientRect()
        return (
          Number(getComputedStyle(node).opacity) >= 0.99 &&
          rect.bottom <= innerHeight + 1
        )
      })
      const geometry = await dialog.evaluate((node) => {
        const rect = node.getBoundingClientRect()
        return {
          opacity: Number(getComputedStyle(node).opacity),
          top: rect.top,
          bottom: rect.bottom,
          viewportHeight: innerHeight,
        }
      })
      if (
        geometry.opacity < 0.99 ||
        geometry.top < 0 ||
        geometry.bottom > geometry.viewportHeight + 1
      )
        throw new Error(
          `sheet did not open visibly: ${JSON.stringify(geometry)}`,
        )
    },
  },
  {
    file: 'overlays-bottom-sheet-mid-close.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.composer .attach',
    async act(page) {
      await page.getByRole('button', { name: 'Add attachment' }).click()
      await page.getByRole('dialog', { name: 'Add attachment' }).waitFor()
      await page.waitForFunction(() => {
        const node = document.querySelector(
          '[role="dialog"][aria-label="Add attachment"]',
        )
        return (
          node instanceof HTMLElement &&
          node.getBoundingClientRect().bottom <= innerHeight + 1
        )
      })
      await page.locator('.sheet-backdrop').click({ position: { x: 5, y: 5 } })
      await page.locator('.sheet-backdrop.closing').waitFor()
      if (!(await page.getByRole('dialog', { name: 'Add attachment' }).count()))
        throw new Error('sheet unmounted before its exit animation')
    },
    async afterCapture(page) {
      await page
        .getByRole('dialog', { name: 'Add attachment' })
        .waitFor({ state: 'detached', timeout: 1_000 })
    },
  },
  {
    file: 'overlays-thread-menu-open.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.detail-header',
    async act(page) {
      await page.getByRole('button', { name: 'Thread menu' }).click()
      const menu = page.getByRole('menu', { name: 'Thread menu' })
      await menu.waitFor()
      if (
        (await menu.evaluate((node) => getComputedStyle(node).visibility)) !==
        'visible'
      )
        throw new Error('anchored menu remained hidden')
    },
  },
  {
    file: 'overlays-thread-menu-back-close.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.detail-header',
    async act(page) {
      await page.evaluate(() => history.pushState({ overlays: true }, ''))
      await page.getByRole('button', { name: 'Thread menu' }).click()
      await page.getByRole('menu', { name: 'Thread menu' }).waitFor()
      await page.evaluate(() => history.back())
      await page.locator('.anchored-menu-backdrop.closing').waitFor()
    },
  },
  {
    file: 'overlays-desktop-switcher-open.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: DESKTOP,
    ready: '.desktop-switcher',
    async act(page) {
      await page.getByRole('button', { name: /Switch desktop/ }).click()
      const menu = page.getByRole('menu', { name: 'Switch desktop' })
      await menu.waitFor()
      if (
        (await menu.evaluate((node) => getComputedStyle(node).visibility)) !==
        'visible'
      )
        throw new Error('desktop switcher remained hidden')
    },
  },
  {
    file: 'overlays-project-switcher-open.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.thread-subtitle',
    async act(page) {
      await page.getByRole('button', { name: 'Switch project' }).click()
      const menu = page.getByRole('menu', { name: 'Switch project' })
      await menu.waitFor()
      if (
        (await menu.evaluate((node) => getComputedStyle(node).visibility)) !==
        'visible'
      )
        throw new Error('project switcher remained hidden')
    },
  },
  {
    file: 'overlays-row-menu-open.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: DESKTOP,
    ready: '.thread-row',
    async act(page) {
      const row = page.locator('.thread-row').first()
      const box = await row.boundingBox()
      if (!box) throw new Error('thread row missing')
      await row.dispatchEvent('contextmenu', {
        button: 2,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
        bubbles: true,
        cancelable: true,
      })
      const menu = page.getByRole('menu', { name: 'Thread actions' })
      await menu.waitFor()
      if (
        (await menu.evaluate((node) => getComputedStyle(node).visibility)) !==
        'visible'
      )
        throw new Error('row action menu remained hidden')
    },
  },
  {
    file: 'overlays-nested-sheet-over-sheet.png',
    reducedMotion: 'no-preference',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer .attach',
    async act(page) {
      await page.getByRole('button', { name: 'Add attachment' }).click()
      await page.getByRole('dialog', { name: 'Add attachment' }).waitFor()
      await page.evaluate(() => {
        const nested = document.createElement('div')
        nested.className = 'sheet-backdrop overlays-nested-test'
        nested.innerHTML =
          '<section class="bottom-sheet" role="dialog" aria-label="Nested test sheet"><header><h2>Nested test</h2></header><div class="sheet-body">Second overlay</div></section>'
        document.body.append(nested)
      })
      await page.getByRole('dialog', { name: 'Nested test sheet' }).waitFor()
      if ((await page.locator('.sheet-backdrop').count()) !== 2)
        throw new Error('nested sheet did not render over the first sheet')
    },
  },
  {
    file: 'transitions-selected-row-phone.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-row',
    async act(page) {
      await page
        .locator('.thread-row')
        .first()
        .evaluate((node) => {
          node.classList.add('selected')
          node.setAttribute('aria-current', 'page')
        })
      await assertSelectedRowGeometry(
        page,
        '.thread-row.selected',
        '.threads-page-body',
      )
    },
  },
  {
    file: 'transitions-selected-row-two-pane.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-gen`,
    ready: '.split-sidebar .thread-row.selected',
    async act(page) {
      await assertSelectedRowGeometry(
        page,
        '.split-sidebar .thread-row.selected',
        '.split-sidebar .threads-page-body',
      )
    },
  },
  {
    file: 'overlays-project-row-alignment.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-tabs',
    async act(page) {
      await page.getByRole('tab', { name: 'Projects' }).click()
      await page.locator('.project-row').first().click()
      await waitForProjectGroupSettled(page)
      const row = page.locator('.project-thread-row').first()
      await row.evaluate((node) => node.classList.add('selected'))
      await assertSelectedRowGeometry(
        page,
        '.project-thread-row.selected',
        '.threads-page-body',
        '.project-row .project-row-copy',
        0,
      )
      await assertNoHorizontalOverflow(page, '.threads-page-body')
    },
  },
  {
    file: 'editor-queue-one.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-queue`,
    query: 'queueCount=1',
    ready: '.queue-panel',
    async act(page) {
      if ((await page.locator('.queue-item').count()) !== 1)
        throw new Error('one-item queue did not render one row')
      if (await page.locator('.queue-summary, .queue-sheet').count())
        throw new Error('removed queue overlay controls are still present')
      await assertQueueHeight(page)
    },
  },
  {
    file: 'editor-queue-two.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-queue`,
    query: 'queueCount=2',
    ready: '.queue-panel',
    async act(page) {
      if ((await page.locator('.queue-item').count()) !== 2)
        throw new Error('two-item queue did not render two rows')
      await assertQueueHeight(page)
    },
  },
  {
    file: 'editor-queue-five.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-queue`,
    query: 'queueCount=5',
    ready: '.queue-panel',
    async act(page) {
      if ((await page.locator('.queue-item').count()) !== 5)
        throw new Error('five-item queue did not render five inline rows')
      const scroll = page.locator('.queue-scroll')
      const geometry = await scroll.evaluate((node) => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        maxHeight: getComputedStyle(node).maxHeight,
      }))
      if (geometry.scrollHeight <= geometry.clientHeight)
        throw new Error(
          `five-item queue does not scroll: ${JSON.stringify(geometry)}`,
        )
      if (
        !(await scroll.evaluate((node) =>
          node.classList.contains('overflowing'),
        ))
      )
        throw new Error('overflow fade mask was not enabled')
      await assertQueueHeight(page)
    },
  },
  {
    file: 'editor-queue-editing.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-queue`,
    query: 'queueCount=2',
    ready: '.queue-copy',
    async act(page) {
      await page.locator('.queue-copy').first().click()
      const editor = page.getByRole('textbox', { name: 'Edit queued message' })
      await editor.waitFor()
      if (await page.locator('.queue-item.editing .queue-actions').count())
        throw new Error('queue actions remained visible while editing')
      await editor.fill('Bump the preview version\nwith browser verification')
      await assertQueueHeight(page)
    },
  },
  {
    file: 'editor-queue-mid-drag.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    hasTouch: true,
    route: `${DESKTOP}/t-queue`,
    query: 'queueCount=5',
    ready: '.queue-item',
    async act(page) {
      const rows = page.locator('.queue-item')
      const first = await rows.nth(0).boundingBox()
      const fourth = await rows.nth(3).boundingBox()
      if (!first || !fourth) throw new Error('queue drag rows missing')
      const cdp = await page.context().newCDPSession(page)
      const start = { x: first.x + 18, y: first.y + first.height / 2 }
      const target = { x: start.x, y: fourth.y + fourth.height / 2 }
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [start],
      })
      await page.locator('.queue-item.dragging').waitFor({ timeout: 1000 })
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [target],
      })
      await page.waitForTimeout(90)
      if ((await page.locator('.queue-item.dragging').count()) !== 1)
        throw new Error('long press did not lift a queue row')
      const shifted = await rows.evaluateAll((nodes) =>
        nodes.slice(1, 4).map((node) => getComputedStyle(node).transform),
      )
      if (shifted.every((transform) => transform === 'none'))
        throw new Error('neighbour rows did not shift aside')
    },
  },
  {
    file: 'editor-queue-after-drop.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    hasTouch: true,
    route: `${DESKTOP}/t-queue`,
    query: 'queueCount=5',
    ready: '.queue-item',
    async act(page) {
      const rows = page.locator('.queue-item')
      const first = await rows.nth(0).boundingBox()
      const fourth = await rows.nth(3).boundingBox()
      if (!first || !fourth) throw new Error('queue drag rows missing')
      const cdp = await page.context().newCDPSession(page)
      const start = { x: first.x + 18, y: first.y + first.height / 2 }
      const target = { x: start.x, y: fourth.y + fourth.height / 2 }
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [start],
      })
      await page.locator('.queue-item.dragging').waitFor({ timeout: 1000 })
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [target],
      })
      await page.waitForTimeout(70)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
      await page.waitForFunction(() =>
        document
          .querySelector('.queue-scroll')
          ?.getAttribute('data-queue-order')
          ?.startsWith('fixture-queue-1'),
      )
      const order = await page
        .locator('.queue-scroll')
        .getAttribute('data-queue-order')
      if (
        order !==
        'fixture-queue-1,fixture-queue-2,fixture-queue-3,fixture-queue-0,fixture-queue-4'
      )
        throw new Error(
          `queue state order did not persist after drop: ${order}`,
        )
      await page.waitForFunction(
        (expected) =>
          [...document.querySelectorAll('.queue-item')]
            .map((node) => node.getAttribute('data-queue-id'))
            .join(',') === expected,
        order,
      )
      const domOrder = await page
        .locator('.queue-item')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-queue-id')),
        )
      if (domOrder.join(',') !== order)
        throw new Error(
          `DOM order differs from queue state: ${domOrder.join(',')} / ${order}`,
        )
    },
  },
  {
    file: 'editor-sheet-over-activity.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar-stop',
    async act(page) {
      const stop = page.locator('.activity-bar-stop')
      const box = await stop.boundingBox()
      if (!box) throw new Error('activity stop missing')
      await page.getByRole('button', { name: 'Add attachment' }).click()
      await page.getByRole('dialog', { name: 'Add attachment' }).waitFor()
      const hit = await page.evaluate(
        ({ x, y }) => {
          const node = document.elementFromPoint(x, y)
          return {
            tag: node?.tagName,
            classes: node instanceof Element ? node.className : '',
            insideOverlay: Boolean(
              node?.closest('.sheet-backdrop, .bottom-sheet'),
            ),
          }
        },
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      )
      if (!hit.insideOverlay)
        throw new Error(
          `sheet does not cover activity stop: ${JSON.stringify(hit)}`,
        )
    },
  },
  {
    file: 'composer-draft-project-header.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-tabs',
    async act(page) {
      await page.getByRole('tab', { name: 'Projects' }).click()
      const subtitle = await page
        .locator('.project-row small')
        .first()
        .innerText()
      if (!/^\d+ threads?$/.test(subtitle))
        throw new Error(
          `project subtitle repeats project metadata: ${subtitle}`,
        )
    },
  },
  {
    file: 'transitions-bottom-sheet-mid-closing.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer .attach',
    async act(page) {
      await page.getByRole('button', { name: 'Add attachment' }).click()
      await page.getByRole('dialog', { name: 'Add attachment' }).waitFor()
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await page.locator('.sheet-backdrop.closing').waitFor()
      await page.waitForTimeout(80)
    },
  },
  {
    file: 'overlays-stop-at-rest.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar-stop',
    async act(page) {
      await assertStopRing(page, false)
    },
  },
  {
    file: 'composer-draft-stop-mid-hold-phone.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar-stop',
    async act(page) {
      const button = page.locator('.activity-bar-stop')
      const box = await button.boundingBox()
      if (!box) throw new Error('stop button missing')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(500)
      await assertStopRing(page, true)
      await assertStopRingInsideViewport(page)
    },
  },
  {
    // Real touch input (not mouse): the device showed the ring enlarge but
    // never fill, so measure the drawn progress after a 1s touch hold.
    file: 'project-groups-stop-touch-hold.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    hasTouch: true,
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar-stop',
    async act(page) {
      const box = await page.locator('.activity-bar-stop').boundingBox()
      if (!box) throw new Error('stop button missing')
      const cdp = await page.context().newCDPSession(page)
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [point],
      })
      await page.waitForTimeout(1000)
      const fill = await page
        .locator('.stop-hold-progress')
        .evaluate((node) => {
          const length = node.getTotalLength()
          const dash = getComputedStyle(node)
          return {
            length,
            dasharray: dash.strokeDasharray,
            dashoffset: dash.strokeDashoffset,
          }
        })
      console.log('touch-hold fill', JSON.stringify(fill))
      globalThis.__stopTouchFill = fill
    },
  },
  {
    file: 'composer-draft-stop-mid-hold-two-pane.png',
    viewport: TABLET,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar-stop',
    async act(page) {
      const button = page.locator('.activity-bar-stop')
      const box = await button.boundingBox()
      if (!box) throw new Error('stop button missing')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(500)
      await assertStopRing(page, true)
      await assertStopRingInsideViewport(page)
    },
  },
  {
    file: 'message-actions-thread-orb-loading.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.tool-summary .loading-orb',
    async act(page) {
      await page
        .locator('.tool-summary .loading-orb')
        .first()
        .scrollIntoViewIfNeeded()
    },
  },
  {
    file: 'message-actions-jump-latest-separated.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar',
    async act(page) {
      await page.locator('.message-scroll').evaluate((node) => {
        node.scrollTop = 0
        node.dispatchEvent(new Event('scroll', { bubbles: true }))
      })
      await page.locator('.latest-jump').waitFor()
      const gap = await page.evaluate(() => {
        const jump = document
          .querySelector('.latest-jump')
          ?.getBoundingClientRect()
        const bar = document
          .querySelector('.activity-bar')
          ?.getBoundingClientRect()
        if (!jump || !bar) throw new Error('jump or activity bar missing')
        return bar.top - jump.bottom
      })
      if (gap < 12) throw new Error(`latest/activity gap is ${gap}px`)
    },
  },
  {
    file: 'message-actions-stop-mid-hold.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar-stop',
    async act(page) {
      const button = page.locator('.activity-bar-stop')
      const box = await button.boundingBox()
      if (!box) throw new Error('stop button missing')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(320)
    },
  },
  {
    file: 'overlays-draft-and-queue-indicators.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-status.draft',
    async act(page) {
      const draftCount = await page.locator('.thread-status.draft').count()
      const queuedCount = await page.locator('.thread-status.queued').count()
      if (!draftCount || !queuedCount)
        throw new Error(
          `status indicators missing: draft=${draftCount} queued=${queuedCount}`,
        )
    },
  },

  {
    file: 'composer-controls-generating-scrolled.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar',
    async act(page) {
      await page.locator('.message-scroll').evaluate((node) => {
        node.scrollTop = 0
        node.dispatchEvent(new Event('scroll', { bubbles: true }))
      })
      await page.locator('.latest-jump.above-activity').waitFor()
      const fit = await page.locator('.composer-options').evaluate((node) => ({
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }))
      if (fit.scrollWidth > fit.clientWidth)
        throw new Error(`composer options overflow: ${JSON.stringify(fit)}`)
    },
  },
  {
    file: 'composer-controls-idle-scrolled.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-long`,
    ready: '.composer',
    async act(page) {
      await page.locator('.message-scroll').evaluate((node) => {
        node.scrollTop = 0
        node.dispatchEvent(new Event('scroll', { bubbles: true }))
      })
      await page.locator('.latest-jump:not(.above-activity)').waitFor()
    },
  },
  {
    file: 'composer-controls-add-sheet.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer .attach',
    async act(page) {
      await page.getByRole('button', { name: 'Add attachment' }).click()
      await page.getByRole('dialog', { name: 'Add attachment' }).waitFor()
    },
  },
  {
    file: 'composer-controls-start-composer.png',
    viewport: PHONE,
    route: `${DESKTOP}?new=1`,
    ready: '.split-start-composer .composer',
    async act(page) {
      const fit = await page.locator('.composer-options').evaluate((node) => ({
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }))
      if (fit.scrollWidth > fit.clientWidth)
        throw new Error(
          `start composer options overflow: ${JSON.stringify(fit)}`,
        )
    },
  },
  {
    file: 'queue-panel-sidebar-collapse-mid.png',
    viewport: TABLET,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.split-toggle',
    async act(page) {
      await pauseSidebarCollapse(page, 0.5)
    },
  },
  {
    file: 'queue-panel-sidebar-collapse-finished.png',
    viewport: TABLET,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.split-toggle',
    async act(page) {
      await pauseSidebarCollapse(page, 1)
      if (
        await page.getByRole('button', { name: 'Show thread list' }).count()
      ) {
        const buttons = await page
          .getByRole('button', { name: 'Show thread list' })
          .count()
        if (buttons !== 1) throw new Error(`found ${buttons} sidebar toggles`)
      }
    },
  },
  {
    file: 'queue-panel-phone-push-mid.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: DESKTOP,
    ready: '.thread-row',
    async act(page) {
      await pausePhonePush(page, 0.5)
    },
  },
  {
    file: 'composer-controls-two-pane-collapsed.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-gen`,
    ready: '.split-toggle',
    async act(page) {
      await page.getByRole('button', { name: 'Hide thread list' }).click()
      await page.waitForFunction(() =>
        document.querySelector('.split-shell')?.classList.contains('collapsed'),
      )
      await page.locator('.detail-header').waitFor()
      if (
        await page.getByRole('button', { name: 'Show thread list' }).count()
      ) {
        const buttons = await page
          .getByRole('button', { name: 'Show thread list' })
          .count()
        if (buttons !== 1) throw new Error(`found ${buttons} sidebar toggles`)
      }
    },
  },
  {
    file: 'anchored-menus-thread-menu.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.detail-header',
    async act(page) {
      await page.getByRole('button', { name: 'Thread menu' }).click()
      await page.getByRole('menu', { name: 'Thread menu' }).waitFor()
    },
  },
  {
    file: 'anchored-menus-desktop-menu.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.desktop-strip',
    async act(page) {
      await page.locator('.desktop-strip').click()
      await page.getByRole('menu', { name: 'Switch desktop' }).waitFor()
    },
  },
  {
    file: 'anchored-menus-row-menu.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-row',
    async act(page) {
      const row = page.locator('.thread-row').nth(1)
      const box = await row.boundingBox()
      if (!box) throw new Error('thread row missing')
      await page.mouse.click(box.x + 24, box.y + box.height / 2, {
        button: 'right',
      })
      await page.getByRole('menu', { name: 'Thread actions' }).waitFor()
    },
  },
  {
    file: 'anchored-menus-thread-header.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.detail-actions',
  },
  {
    file: 'anchored-menus-palenight-threads.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-gen`,
    ready: '.split-sidebar .thread-list',
    async act(page) {
      await setFixtureTheme(page, 'palenight', 'dark')
    },
  },
  {
    file: 'anchored-menus-chocolate-projects-scrolled.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-gen`,
    ready: '.split-sidebar .thread-tabs',
    async act(page) {
      await setFixtureTheme(page, 'chocolate', 'dark')
      await page.getByRole('tab', { name: 'Projects' }).click()
      await scrollFixtureBody(page, '.split-sidebar .threads-page-body')
    },
  },
  {
    file: 'anchored-menus-light-navigation.png',
    viewport: TABLET,
    route: '/settings',
    ready: '.split-nav',
    colorScheme: 'light',
    async act(page) {
      await setFixtureTheme(page, 'one_light', 'light')
      await assertNavigationWithoutInbox(page, '.split-nav')
    },
  },
  {
    file: 'anchored-menus-palenight-settings-scrolled.png',
    viewport: TABLET,
    route: '/settings',
    ready: '.settings-page-body',
    async act(page) {
      await setFixtureTheme(page, 'palenight', 'dark')
      await scrollFixtureBody(page, '.settings-page-body')
    },
  },
  ...['collapsed', 'expanded'].map((state) => ({
    file: `fold-settings-${state}.png`,
    viewport: PHONE,
    route: '/settings',
    ready: '#fold-heading',
    async act(page) {
      await page.locator('#fold-heading').scrollIntoViewIfNeeded()
      const section = page.locator('section[aria-labelledby="fold-heading"]')
      if (state === 'expanded') {
        await section
          .getByRole('button', { name: /advanced fold settings/i })
          .click()
        await page.waitForTimeout(450)
      }
      const geometry = await section.evaluate((node) => {
        const list = node.querySelector('.fold-advanced-list')
        return {
          text: node.textContent ?? '',
          listClipped: list ? list.scrollHeight > list.clientHeight + 1 : false,
          overflow: node.scrollWidth > node.clientWidth + 1,
          hasList: Boolean(list),
        }
      })
      if (geometry.overflow)
        throw new Error('Fold settings overflow horizontally')
      if (geometry.text.includes('Clear angle'))
        throw new Error('Clear angle row should be gone')
      if (
        state === 'collapsed' &&
        (geometry.hasList || geometry.text.includes('Blur spread'))
      )
        throw new Error('Advanced rows should be collapsed by default')
      if (state === 'expanded') {
        if (!geometry.text.includes('Reset to defaults'))
          throw new Error('Advanced group did not open')
        if (geometry.listClipped) throw new Error('Advanced group is clipped')
      }
      if (state === 'expanded')
        await section.getByText('Reset to defaults').scrollIntoViewIfNeeded()
      else await page.locator('#fold-heading').scrollIntoViewIfNeeded()
      const clipped = await section.evaluate((node) =>
        [...node.querySelectorAll('.settings-value')].some(
          (value) => value.scrollWidth > value.clientWidth + 1,
        ),
      )
      if (clipped) throw new Error('A fold setting value is truncated')
    },
  })),
  {
    file: 'anchored-menus-light-crystals.png',
    viewport: TABLET,
    route: '/d/fixture-desktop/crystals',
    ready: '.crystals-page',
    colorScheme: 'light',
    async act(page) {
      await setFixtureTheme(page, 'one_light', 'light')
    },
  },
  {
    file: 'composer-activity-bar-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar',
  },
  {
    file: 'composer-activity-bar-latest-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar',
    async act(page) {
      await page.locator('.message-scroll').evaluate((node) => {
        node.scrollTop = 0
        node.dispatchEvent(new Event('scroll', { bubbles: true }))
      })
      await page.locator('.latest-jump.above-activity').waitFor()
    },
  },
  {
    file: 'composer-activity-bar-tablet.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-gen`,
    ready: '.activity-bar',
  },
  {
    file: 'composer-press-areas-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.tool-summary',
    async act(page) {
      await page.locator('.tool-summary').first().scrollIntoViewIfNeeded()
    },
  },
  {
    file: 'composer-goal-loop-sheet-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer .attach',
    async act(page) {
      await page.getByRole('button', { name: 'Add attachment' }).click()
      await page.getByRole('button', { name: 'Edit goal or loop' }).click()
      await page.getByRole('dialog', { name: 'Goal + Loop' }).waitFor()
    },
  },
  {
    file: 'composer-goal-loop-sheet-tablet.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer .attach',
    async act(page) {
      await page.getByRole('button', { name: 'Add attachment' }).click()
      await page.getByRole('button', { name: 'Edit goal or loop' }).click()
      await page.getByRole('dialog', { name: 'Goal + Loop' }).waitFor()
    },
  },
  {
    file: 'composer-goal-loop-strips-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer-loop-strip',
  },
  {
    file: 'composer-expanded-composer-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer',
    async act(page) {
      await page
        .locator('.composer textarea')
        .fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7')
      await openComposerEditor(page)
    },
  },
  {
    file: 'composer-editor-origin-phone.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.composer',
    async act(page) {
      await page
        .locator('.composer textarea')
        .fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7')
      await openComposerEditor(page, 0)
    },
  },
  {
    file: 'composer-editor-mid-expand-phone.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.composer',
    async act(page) {
      await page
        .locator('.composer textarea')
        .fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7')
      await openComposerEditor(page, 0.5)
    },
  },
  {
    file: 'composer-editor-expanded-phone.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.composer',
    async act(page) {
      await page
        .locator('.composer textarea')
        .fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7')
      await openComposerEditor(page)
    },
  },
  {
    file: 'composer-expanded-composer-tablet.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer',
    async act(page) {
      await page
        .locator('.composer textarea')
        .fill(
          Array.from(
            { length: 14 },
            (_, index) =>
              `Shared composer line ${index + 1}: model, reasoning, goal, attachments, and send controls.`,
          ).join('\n'),
        )
      await openComposerEditor(page)
    },
  },
  {
    file: 'composer-icon-buttons-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer .send',
    async act(page) {
      await reportBoundingSizes(page, ['.composer .attach', '.composer .send'])
    },
  },
  {
    file: 'activity-phone-list-scrolled.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-list-header',
    async act(page) {
      await assertFixedHeader(
        page,
        '.threads-page-body',
        '.thread-list-header',
        ['.thread-tabs'],
      )
    },
  },
  {
    file: 'activity-two-pane-list-scrolled.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-gen`,
    ready: '.split-sidebar .thread-list-header',
    async act(page) {
      await assertFixedHeader(
        page,
        '.split-sidebar .threads-page-body',
        '.split-sidebar .thread-list-header',
        ['.split-sidebar .thread-tabs'],
      )
    },
  },
  {
    file: 'activity-settings-scrolled.png',
    viewport: PHONE,
    route: '/settings',
    ready: '.settings-page',
    async act(page) {
      await assertFixedHeader(
        page,
        '.settings-page-body',
        '.settings-page .page-header',
      )
    },
  },
  ...[
    {
      key: 'idle-34',
      query: 'crew=idle&context=34',
      expected: { crewActive: false, level: 'ok' },
    },
    {
      key: 'active-34',
      query: 'crew=active&context=34',
      expected: { crewActive: true, level: 'ok' },
    },
    {
      key: 'active-82',
      query: 'crew=active&context=82',
      expected: { crewActive: true, level: 'warn' },
    },
    {
      key: 'active-95',
      query: 'crew=active&context=95',
      expected: { crewActive: true, level: 'danger' },
    },
  ].flatMap((state) =>
    [
      { suffix: 'phone', viewport: PHONE },
      { suffix: 'two-pane', viewport: TABLET },
    ].map((layout) => ({
      file: `themes-header-${state.key}-${layout.suffix}.png`,
      viewport: layout.viewport,
      route: `${DESKTOP}/t-gen`,
      query: state.query,
      reducedMotion: 'no-preference',
      ready: '.context-ring',
      async act(page) {
        await assertQuietHeaderState(page, state.expected)
      },
    })),
  ),
  ...[
    {
      key: 'deleted',
      route: `${DESKTOP}/deleted-thread`,
      query: '',
      ready: '.thread-missing-state',
    },
    {
      key: 'error',
      route: `${DESKTOP}/t-ctx`,
      query: 'error=generic',
      ready: '.thread-error-banner',
    },
  ].flatMap((state) =>
    [
      { suffix: 'phone', viewport: PHONE },
      { suffix: 'two-pane', viewport: TABLET },
    ].map((layout) => ({
      file: `themes-${state.key}-${layout.suffix}.png`,
      viewport: layout.viewport,
      route: state.route,
      query: state.query,
      ready: state.ready,
      async act(page) {
        if (state.key === 'deleted') {
          await page.getByText('This conversation was deleted').waitFor()
          if (await page.getByText(/GET \/api\//).count())
            throw new Error('raw API error is visible')
        } else {
          await page.getByRole('alert').waitFor()
          if (await page.getByText(/Synthetic fixture|GET \/api\//).count())
            throw new Error('raw generic error is visible')
        }
      },
    })),
  ),
  {
    file: 'response-state-recipe-gone-after-extract.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    query: 'recipeReady=1&crew=active&context=34',
    reducedMotion: 'no-preference',
    ready: '.detail-header',
    async act(page) {
      await assertRecipeDismissPolicy(page)
    },
  },
  {
    // An unhandled recipe is shown once when the thread opens (no live
    // recipe_ready event needed).
    file: 'settings-recipe-on-open.png',
    viewport: PHONE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-gen`,
    ready: '.recipe-banner',
  },
  {
    file: 'activity-thread-header-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.detail-actions .header-action-button',
    async act(page) {
      await assertHeaderActions(page, '.detail-actions')
    },
  },
  {
    file: 'activity-thread-header-two-pane.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-gen`,
    ready: '.split-main .detail-actions .header-action-button',
    async act(page) {
      await assertHeaderActions(page, '.split-main .detail-actions')
    },
  },
  {
    file: 'missions-list-generating.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-spinner',
  },
  {
    file: 'missions-pending-orb.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-ctx`,
    query: 'pending=phase',
    ready: '.pending-assistant',
  },
  {
    file: 'missions-thread-menu.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.detail-header',
    async act(page) {
      await page.getByRole('button', { name: 'Thread menu' }).click()
      await page.getByRole('menu', { name: 'Thread menu' }).waitFor()
    },
  },
  {
    file: 'missions-crew-sheet.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.detail-header',
    async act(page) {
      await page.getByRole('button', { name: /agents running|Crew/ }).click()
      await page.getByRole('dialog', { name: 'Crew' }).waitFor()
    },
  },
  {
    file: 'theme-scales-crew-sheet-total.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.detail-header',
    async act(page) {
      await page.getByRole('button', { name: /agents running|Crew/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Crew' })
      await dialog.waitFor()
      const title = dialog.locator('header h2')
      if (!(await title.getByText('2 runs', { exact: true }).count()))
        throw new Error('crew total missing from sheet title')
      if (!(await title.getByText('1 running', { exact: true }).count()))
        throw new Error('crew active total missing from sheet title')
      if (await dialog.locator('.crew-counts').count())
        throw new Error('single mission duplicated crew totals')
    },
  },
  {
    file: 'queue-contained-phone-settings.png',
    viewport: PHONE,
    route: '/settings',
    ready: '.settings-page',
    safeInsets: true,
    fullscreen: false,
  },
  {
    file: 'queue-fullscreen-phone-list.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-list-header',
    safeInsets: true,
    fullscreen: true,
  },
  {
    file: 'queue-contained-two-pane.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-ctx`,
    ready: '.detail-header',
    safeInsets: true,
    fullscreen: false,
  },
  {
    file: 'queue-fullscreen-two-pane.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-ctx`,
    ready: '.detail-header',
    safeInsets: true,
    fullscreen: true,
  },
  {
    file: 'queue-search-pill.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-list-header',
    safeInsets: true,
    fullscreen: true,
    async act(page) {
      const icon = await page
        .getByRole('button', { name: 'Search', exact: true })
        .boundingBox()
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await page.locator('.thread-search-pill input').fill('release')
      const pill = await page.locator('.thread-search-pill').boundingBox()
      if (!icon || !pill || Math.abs(icon.y - pill.y) > 0.5)
        throw new Error('search pill did not preserve the icon bbox top')
    },
  },
  {
    file: 'queue-attachment-cards.png',
    viewport: TABLET,
    route: `${DESKTOP}?new=1`,
    ready: '.split-start-composer',
    async act(page) {
      await page.getByRole('button', { name: 'Add attachment' }).click()
      await page
        .locator('input[type="file"][multiple]:not([accept])')
        .setInputFiles({
          name: 'release-notes-with-a-long-name.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('fixture'),
        })
      await page.locator('.attachment-chip').waitFor()
      await page
        .locator('.bottom-sheet')
        .getByRole('button', { name: 'Close' })
        .click()
    },
  },
  ...[
    ['chocolate', 'dark'],
    ['palenight', 'dark'],
    ['onedark', 'dark'],
    ['one_light', 'light'],
  ].map(([theme, mode]) => ({
    file: `queue-code-${theme}.png`,
    viewport: PHONE,
    route: `${DESKTOP}/t-long`,
    ready: '.markdown-content',
    colorScheme: mode,
    async act(page) {
      await page.evaluate(
        ({ theme, mode }) => {
          localStorage.setItem(
            'alma-mobile.theme.v1',
            JSON.stringify({
              mode,
              dark: mode === 'dark' ? theme : 'palenight',
              light: mode === 'light' ? theme : 'one_light',
            }),
          )
        },
        { theme, mode },
      )
      await page.reload()
      await page
        .locator('.markdown-content pre')
        .last()
        .scrollIntoViewIfNeeded()
    },
  })),
  {
    file: 'queue-expanded-editor.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer',
    async act(page) {
      await page
        .locator('.composer textarea')
        .fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7')
      await page.getByRole('button', { name: 'Expand editor' }).click()
      await page.getByRole('dialog', { name: 'Message editor' }).waitFor()
    },
  },
  {
    file: 'thread-list-search-collapsed.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-list-header',
    safeInsets: true,
    async act(page) {
      const box = await page
        .getByRole('button', { name: 'Search', exact: true })
        .boundingBox()
      if (!box) throw new Error('search icon missing')
      console.log(
        `search collapsed top=${box.y.toFixed(2)} height=${box.height.toFixed(2)}`,
      )
    },
  },
  {
    file: 'thread-list-search-expanded.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-list-header',
    safeInsets: true,
    async act(page) {
      const icon = await page
        .getByRole('button', { name: 'Search', exact: true })
        .boundingBox()
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await page.waitForTimeout(110)
      const mid = await page.locator('.thread-search-pill').boundingBox()
      await page.waitForTimeout(180)
      const field = await page.locator('.thread-search-pill').boundingBox()
      if (!icon || !mid || !field) throw new Error('search boxes missing')
      for (const [label, box] of [
        ['mid', mid],
        ['expanded', field],
      ]) {
        if (Math.abs(box.y - icon.y) > 0.5)
          throw new Error(`search ${label} top ${box.y} != icon top ${icon.y}`)
      }
      console.log(
        `search icon top=${icon.y.toFixed(2)} mid=${mid.y.toFixed(2)} expanded=${field.y.toFixed(2)}`,
      )
    },
  },
  {
    file: 'thread-list-thread-insets-goal-recipe.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer-goal-strip',
    safeInsets: true,
  },
  {
    file: 'thread-list-start-goal-attachments.png',
    viewport: TABLET,
    route: `${DESKTOP}?new=1`,
    ready: '.split-start-composer',
    async act(page) {
      await page.getByRole('button', { name: 'Add attachment' }).click()
      await page.getByRole('button', { name: 'Set goal or loop' }).click()
      await page
        .getByLabel('Completion condition')
        .fill('Ship the mobile release')
      await page.getByRole('button', { name: 'Start goal' }).click()
      const goalDialog = page.getByRole('dialog', { name: 'Goal + Loop' })
      await goalDialog.getByRole('button', { name: 'Close' }).click()
      await goalDialog.waitFor({ state: 'detached' })
      await page
        .locator('input[type="file"][multiple]:not([accept])')
        .setInputFiles({
          name: 'release-notes.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('Synthetic screenshot fixture'),
        })
      await page.locator('.composer-goal-strip').waitFor()
      await page.locator('.attachment-chip').waitFor()
      await page
        .locator('.bottom-sheet')
        .getByRole('button', { name: 'Close' })
        .click()
    },
  },
  {
    file: 'thread-list-two-pane-crystals-rail.png',
    viewport: { width: 884, height: 1104 },
    route: '/d/fixture-desktop/crystals',
    ready: '.split-nav a[aria-label="Crystals"].active',
    async act(page) {
      if (await page.locator('.split-sidebar-footer').count())
        throw new Error('legacy crystals footer remains')
    },
  },
  {
    file: 'thread-list-full-height-sheet.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer',
    safeInsets: true,
    async act(page) {
      await page.getByRole('button', { name: 'Add attachment' }).click()
      await page.locator('.bottom-sheet').evaluate((node) => {
        node.style.maxHeight = '100dvh'
        node.style.height = '100dvh'
      })
    },
  },
  {
    file: 'markdown-content-fold-sidebar-thread.png',
    viewport: { width: 884, height: 1104 },
    route: `${DESKTOP}/t-ctx`,
    ready: '.detail-header .thread-heading',
    safeInsets: true,
  },
  {
    file: 'markdown-content-tablet-sidebar-thread.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-ctx`,
    ready: '.detail-header .thread-heading',
  },
  {
    file: 'markdown-content-start-unified.png',
    viewport: TABLET,
    route: DESKTOP,
    ready: '.split-start-composer .composer',
  },
  {
    file: 'markdown-content-phone-composer.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer',
    async act(page) {
      await page.locator('.composer textarea').fill('A focused composer state')
    },
  },
  {
    file: 'markdown-content-phone-crystal-type.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals/cry_release',
    ready: '.crystal-actions',
    async act(page) {
      await page.getByRole('button', { name: /Type/i }).click()
      await page.getByRole('dialog', { name: 'Crystal type' }).waitFor()
    },
  },
  {
    file: 'api-actions-start-dark.png',
    viewport: TABLET,
    route: DESKTOP,
    ready: '.start-suggestions button',
  },
  {
    file: 'api-actions-start-light.png',
    viewport: TABLET,
    route: DESKTOP,
    ready: '.start-suggestions button',
    colorScheme: 'light',
  },
  {
    file: 'api-actions-phone-start.png',
    viewport: PHONE,
    route: `${DESKTOP}?new=1`,
    ready: '.start-suggestions button',
  },
  {
    file: 'api-actions-search-snippets.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-list-header',
    async act(page) {
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await page.getByRole('textbox', { name: /Search threads/ }).fill('layout')
      await page.locator('.search-snippet').first().waitFor()
    },
  },
  {
    file: 'api-actions-projects-expanded.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-tabs',
    async act(page) {
      await page.getByRole('tab', { name: 'Projects', exact: true }).click()
      await page.locator('.project-row').first().click()
      await waitForProjectGroupSettled(page)
      await page.locator('.project-group.open .project-new-action').waitFor()
      const first = await page
        .locator('.project-group.open .project-threads-inner > *')
        .first()
        .textContent()
      if (!first.includes('New thread in this project'))
        throw new Error('Project creation must be first')
    },
  },
  {
    file: 'navigation-hierarchy-project-group-phone.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-tabs',
    async act(page) {
      await page.getByRole('tab', { name: 'Projects', exact: true }).click()
      await page.locator('.project-row').first().click()
      await waitForProjectGroupSettled(page)
      const row = page
        .locator('.project-group.open .project-thread-row')
        .first()
      await row.waitFor()
      await row.evaluate((node) => node.classList.add('selected'))
      await assertProjectGroupGeometry(page)
    },
  },
  {
    file: 'navigation-hierarchy-project-group-two-pane.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-long`,
    ready: '.split-sidebar .thread-tabs',
    async act(page) {
      await page
        .locator('.split-sidebar')
        .getByRole('tab', { name: 'Projects', exact: true })
        .click()
      await page.locator('.split-sidebar .project-row').first().click()
      await page
        .locator('.split-sidebar .project-group.open .project-thread-row')
        .first()
        .waitFor()
      await assertProjectGroupGeometry(page, '.split-sidebar')
    },
  },
  {
    file: 'navigation-hierarchy-navigation-phone.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.tab-bar',
    async act(page) {
      await assertNavigationWithoutInbox(page, '.tab-bar')
    },
  },
  {
    file: 'navigation-hierarchy-navigation-two-pane.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-long`,
    ready: '.split-nav',
    async act(page) {
      await assertNavigationWithoutInbox(page, '.split-nav')
    },
  },
  {
    file: 'navigation-hierarchy-response-thread.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.response-dot[aria-label="Needs your response"]',
    async act(page) {
      const row = page
        .locator('.thread-row')
        .filter({ hasText: 'Context window budget' })
      await row.locator('.response-dot').waitFor()
      if (await row.locator('.unread-dot').count())
        throw new Error('response mark did not replace unread mark')
    },
  },
  {
    file: 'navigation-hierarchy-crew-idle.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    query: 'crew=idle',
    ready: '.detail-actions button[aria-label^="Crew"]',
    async act(page) {
      await assertQuietHeaderState(page, { crewActive: false, level: 'ok' })
    },
  },
  {
    file: 'navigation-hierarchy-crew-running.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.crew-running-dot',
    async act(page) {
      await assertQuietHeaderState(page, { crewActive: true, level: 'ok' })
    },
  },
  {
    file: 'api-actions-header-online.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-ctx`,
    ready: '.thread-subtitle',
    async act(page) {
      if (
        await page
          .locator(
            '.thread-subtitle .status-dot,.thread-subtitle .desktop-status',
          )
          .count()
      )
        throw new Error('Online header must not show status dot')
    },
  },
  {
    file: 'api-actions-header-offline.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-ctx`,
    query: 'status=offline',
    ready: '.thread-subtitle [aria-label="Offline"]',
  },
  {
    file: 'api-actions-crystal-actions.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals/cry_release',
    ready: '.crystal-actions',
  },

  {
    file: 'phone-refs-picker-recent.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-refs`,
    ready: '.composer-highlight mark',
    async act(page) {
      await typeInComposer(page, ' @')
      await page.locator('.ref-picker-row').first().waitFor()
    },
  },
  {
    file: 'phone-refs-picker-search.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-refs`,
    ready: '.composer-highlight mark',
    async act(page) {
      await typeInComposer(page, ' @crystal:la')
      await page.getByText('Results for “la”').waitFor()
      await page.locator('.ref-picker-row').first().waitFor()
    },
  },
  {
    file: 'phone-refs-composer-tokens.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-refs`,
    ready: '.composer-highlight mark',
    async act(page) {
      await typeInComposer(page, ' and @tablet')
      await page.locator('.ref-picker-row').first().click()
      await page.locator('.composer-highlight mark').nth(1).waitFor()
      await page.locator('.ref-picker').waitFor({ state: 'detached' })
    },
  },
  {
    file: 'phone-refs-history-chips.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-refs`,
    ready: '.message .ref-chip',
  },
  {
    file: 'phone-refs-card-backlinks.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-refs`,
    ready: '.message .ref-chip',
    async act(page) {
      await page.locator('.message .ref-chip').first().click()
      await page.locator('.ref-backlinks .sheet-row').first().waitFor()
    },
  },
  {
    file: 'time-clues-time-clue-header-phone.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-list-header .time-clues-entry .time-clues-unread-dot',
    async act(page) {
      const entries = await page.locator('.time-clues-entry').count()
      const headerEntries = await page
        .locator('.thread-list-header .time-clues-entry')
        .count()
      if (entries !== 1 || headerEntries !== 1)
        throw new Error(
          `phone time clues entry moved: ${JSON.stringify({ entries, headerEntries })}`,
        )
    },
  },
  {
    file: 'time-clues-time-clue-header-two-pane.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-long`,
    ready: '.split-rail .time-clues-entry .time-clues-unread-dot',
    async act(page) {
      const result = await page.evaluate(() => {
        const name = document.querySelector(
          '.split-sidebar .desktop-switcher-name',
        )
        const timeClues = document.querySelector(
          '.split-rail .time-clues-entry .tab-icon',
        )
        const threads = document.querySelector(
          '.split-rail a[aria-label="Threads"] .tab-icon',
        )
        const headerEntry = document.querySelector(
          '.split-sidebar .thread-list-header .time-clues-entry',
        )
        if (
          !(name instanceof HTMLElement) ||
          !(timeClues instanceof HTMLElement) ||
          !(threads instanceof HTMLElement)
        )
          throw new Error('two-pane time clues targets missing')
        const clueBox = timeClues.getBoundingClientRect()
        const threadsBox = threads.getBoundingClientRect()
        return {
          desktopName: {
            scrollWidth: name.scrollWidth,
            clientWidth: name.clientWidth,
          },
          iconDelta: {
            left: clueBox.left - threadsBox.left,
            width: clueBox.width - threadsBox.width,
          },
          headerEntryVisible:
            headerEntry instanceof HTMLElement &&
            getComputedStyle(headerEntry).display !== 'none',
        }
      })
      if (
        result.desktopName.scrollWidth > result.desktopName.clientWidth ||
        Math.abs(result.iconDelta.left) > 1 ||
        Math.abs(result.iconDelta.width) > 1 ||
        result.headerEntryVisible
      )
        throw new Error(
          `two-pane time clues geometry failed: ${JSON.stringify(result)}`,
        )
    },
  },
  ...[
    ['today', 'time-clues-time-clues-today-phone.png'],
    ['this-week', 'time-clues-time-clues-this-week-phone.png'],
    ['next-week', 'time-clues-time-clues-next-week-phone.png'],
  ].map(([label, file]) => ({
    file,
    viewport: PHONE,
    route: '/d/fixture-desktop/time-clues',
    ready: '.time-clue-row',
    async act(page) {
      if (label !== 'today')
        await page
          .getByRole('tab', {
            name: label === 'this-week' ? 'This week' : 'Next week',
          })
          .click()
      await page.locator('.time-clue-row').first().waitFor()
    },
  })),
  {
    file: 'time-clues-time-clues-two-pane.png',
    viewport: TAB_TWO_PANE,
    route: '/d/fixture-desktop/time-clues',
    ready: '.split-main .time-clue-row',
  },
  {
    file: 'files-time-clues-long-press.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/time-clues',
    ready: '.time-clue-row',
    async act(page) {
      // Android WebView reports a long press on these row buttons as a
      // contextmenu (our pointer timer skips buttons) and sends no click.
      const longPress = async (row) => {
        const box = await row.boundingBox()
        if (!box) throw new Error('time clue row missing')
        await row.locator('.time-clue-open').dispatchEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
        })
        await page.waitForTimeout(300)
      }
      // Scheduled tasks have no actions, so a long press must open nothing.
      const scheduled = page
        .locator('.time-clue-row', { hasText: 'Scheduled task' })
        .first()
      await longPress(scheduled)
      const afterScheduled = await page.locator('.anchored-menu').count()
      if (afterScheduled !== 0)
        throw new Error(
          `scheduled long press opened ${afterScheduled} empty menu(s)`,
        )
      const clue = page
        .locator('.time-clue-row', { has: page.locator('.time-clue-more') })
        .first()
      await longPress(clue)
      const items = await page
        .locator('.anchored-menu [role="menuitem"]')
        .allInnerTexts()
      if (items.join('|') !== 'Ignore')
        throw new Error(`clue long press menu: ${JSON.stringify(items)}`)
    },
  },
  {
    file: 'time-clues-time-clues-ignore-menu.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/time-clues',
    ready: '.time-clue-row',
    async act(page) {
      await page.locator('.time-clue-more').first().click()
      await page.getByRole('menuitem', { name: 'Ignore' }).waitFor()
    },
  },
  {
    file: 'time-clues-crystal-material-summaries.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals/cry_layout',
    ready: '.crystal-materials .settings-row',
  },
  {
    file: 'phone-crystals-overview.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals',
    ready: '.crystal-row',
  },
  {
    file: 'phone-crystal-detail.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals/cry_layout',
    ready: '.crystal-checklist',
  },
  {
    file: 'resources-crystal-untyped.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals/cry_untyped',
    ready: '.crystal-type-value.unset',
  },
  {
    file: 'resources-crystal-confirm-blocked.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals/cry_untyped',
    ready: '.crystal-type-value.unset',
    async act(page) {
      await page.getByRole('button', { name: /Validate and confirm/ }).click()
      await page.getByText('Missing: Type.', { exact: true }).waitFor()
      await page.locator('.crystal-type-value.required').waitFor()
    },
  },
  {
    file: 'resources-crystal-checklist-sheet.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals/cry_release',
    ready: '.crystal-checklist',
    async act(page) {
      await page
        .getByRole('button', { name: /Grounded in two sources/ })
        .click()
      await page
        .getByRole('heading', { name: 'Grounded in two sources' })
        .waitFor()
      await page.getByText('turn:release-1', { exact: true }).waitFor()
    },
  },
  {
    file: 'resources-crystal-after-edit.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals/cry_release',
    ready: '.crystal-checklist',
    async act(page) {
      await page
        .getByRole('button', { name: /Grounded in two sources/ })
        .click()
      const input = page.getByRole('textbox', { name: 'Value' })
      await input.fill('Edited from the mobile checklist sheet.')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await page.getByText('Edited from the mobile checklist sheet.').waitFor()
    },
  },
  {
    file: 'phone-crystals-unavailable.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals',
    fixture: 'legacy',
    ready: '.crystals-empty',
  },
  {
    file: 'tablet-crystals-sidebar.png',
    viewport: TABLET,
    route: '/d/fixture-desktop/crystals',
    ready: '.split-nav .crystals-entry.active',
    async act(page) {
      await page.locator('.crystal-row').first().waitFor()
    },
  },
  {
    file: 'pending-after-send.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-ctx`,
    query: 'pending=thinking',
    ready: '.pending-assistant',
    async act(page) {
      await page.getByText('Thinking · 0s', { exact: true }).waitFor()
      const count = await page.locator('.pending-assistant').count()
      if (count !== 1)
        throw new Error(`expected one pending indicator, got ${count}`)
    },
  },
  {
    file: 'pending-phase.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-ctx`,
    query: 'pending=phase',
    ready: '.pending-assistant',
    async act(page) {
      await page.getByText('Memories retrieved', { exact: true }).waitFor()
      const count = await page.locator('.pending-assistant').count()
      if (count !== 1)
        throw new Error(`expected one pending indicator, got ${count}`)
    },
  },
  {
    file: 'pending-reasoning-started.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-ctx`,
    query: 'pending=reasoning',
    ready: '.message.assistant .reasoning',
    async act(page) {
      await page.getByText('I’ll first inspect the current state.').waitFor()
      const pendingCount = await page.locator('.pending-assistant').count()
      const reasoningCount = await page
        .locator('.message.assistant .reasoning')
        .count()
      if (pendingCount !== 0)
        throw new Error(`expected placeholder replaced, got ${pendingCount}`)
      if (reasoningCount !== 1)
        throw new Error(
          `expected one reasoning indicator, got ${reasoningCount}`,
        )
    },
  },
  {
    file: 'list-chrome-phone-thread-list.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-spinner',
    async act(page) {
      for (const selector of [
        '.unread-dot',
        '.thread-status.queued',
        '.thread-status.draft',
      ])
        await page.locator(selector).first().waitFor()
    },
  },
  {
    file: 'tab-indicator-phone-threads.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-tabs[data-tab-ready="true"]',
    async act(page) {
      await assertTabIndicatorGeometry(page)
    },
  },
  {
    file: 'tab-indicator-phone-projects.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-tabs[data-tab-ready="true"]',
    async act(page) {
      await page.getByRole('tab', { name: 'Projects', exact: true }).click()
      await assertTabIndicatorGeometry(page)
    },
  },
  {
    file: 'tab-indicator-two-pane-threads.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-gen`,
    ready: '.split-sidebar .thread-tabs[data-tab-ready="true"]',
    async act(page) {
      await assertTabIndicatorGeometry(page, '.split-sidebar .thread-tabs')
    },
  },
  {
    file: 'tab-indicator-two-pane-projects.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-gen`,
    ready: '.split-sidebar .thread-tabs[data-tab-ready="true"]',
    async act(page) {
      await page
        .locator('.split-sidebar')
        .getByRole('tab', { name: 'Projects', exact: true })
        .click()
      await assertTabIndicatorGeometry(page, '.split-sidebar .thread-tabs')
    },
  },
  {
    file: 'list-chrome-phone-search-expanded.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-list-header',
    async act(page) {
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await page.getByRole('textbox', { name: /Search threads/ }).fill('mobile')
    },
  },
  {
    file: 'phone-projects.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-tabs',
    reducedMotion: 'no-preference',
    async act(page) {
      await page.getByRole('tab', { name: 'Projects', exact: true }).click()
      await page.locator('.project-row').first().waitFor()
      const uncategorized = page.locator('.project-row', {
        hasText: 'Uncategorized',
      })
      if ((await uncategorized.count()) !== 1)
        throw new Error(`Uncategorized groups: ${await uncategorized.count()}`)
      if (
        !(await uncategorized.getByText('3 threads', { exact: true }).count())
      )
        throw new Error('Uncategorized group did not merge three orphan rows')
      const labels = await page.locator('.project-row strong').allTextContents()
      if (labels.at(-1) !== 'Uncategorized')
        throw new Error(`Uncategorized not last: ${labels.join('|')}`)
    },
  },
  {
    file: 'list-chrome-phone-projects-accordion.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-tabs',
    async act(page) {
      await page.getByRole('tab', { name: 'Projects', exact: true }).click()
      await page.locator('.project-row').first().click()
      await waitForProjectGroupSettled(page)
      const selected = page
        .locator('.project-group.open .project-thread-row')
        .first()
      await selected.waitFor()
      await selected.evaluate((node) => {
        node.classList.add('selected')
        node.setAttribute('aria-current', 'page')
      })
      await assertSelectedRowGeometry(
        page,
        '.project-thread-row.selected',
        '.threads-page-body',
        '.project-group.open .project-row .project-row-copy',
        0,
      )
      await assertNoHorizontalOverflow(page, '.threads-page-body')
    },
  },
  {
    file: 'phone-goal-recipe-banner.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    query: 'recipeReady=1',
    ready: '.recipe-banner',
    async act(page) {
      await page.locator('.composer-goal-strip').waitFor()
      await page.locator('.recipe-banner').waitFor()
      await page.getByText('Conversation → workflow').waitFor()
      await page
        .getByText('1 object already extracted from this conversation')
        .waitFor()
    },
  },
  {
    file: 'two-pane-goal-recipe-banner.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-gen`,
    query: 'recipeReady=1',
    ready: '.recipe-banner',
    async act(page) {
      await page.locator('.composer-goal-strip').waitFor()
      await page.locator('.recipe-banner').waitFor()
      await page.getByText('Conversation → workflow').waitFor()
      await page
        .getByText('1 object already extracted from this conversation')
        .waitFor()
    },
  },
  {
    file: 'phone-message-actions.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.message',
    async act(page) {
      const message = page.locator('.message').first()
      await message.scrollIntoViewIfNeeded()
      await message.dispatchEvent('contextmenu', {
        button: 2,
        bubbles: true,
        cancelable: true,
      })
      const sheet = page.getByRole('dialog', { name: 'Message actions' })
      await sheet.waitFor()
      // Focus parks on the sheet container; it must not draw a ring.
      const outline = await sheet.evaluate((node) => {
        node.focus({ focusVisible: true })
        return getComputedStyle(node).outlineStyle
      })
      if (outline !== 'none')
        throw new Error(`bottom sheet focus ring: ${outline}`)
    },
  },
  ...['view', 'quote', 'mention', 'mention-message'].map((step) => ({
    file: `markdown-preview-select-text-${step}.png`,
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.message',
    async act(page) {
      const message = page.locator('.message').nth(1)
      await message.scrollIntoViewIfNeeded()
      await message.dispatchEvent('contextmenu', {
        button: 2,
        bubbles: true,
        cancelable: true,
      })
      const sheet = page.getByRole('dialog', { name: 'Message actions' })
      await sheet.waitFor()
      const composer = page.locator('.composer textarea').first()
      if (step === 'mention-message') {
        await sheet.getByRole('button', { name: 'Mention message' }).click()
        await page.waitForTimeout(300)
        const value = await composer.inputValue()
        if (!value.startsWith('@') || value.includes('**'))
          throw new Error(`message mention draft: ${JSON.stringify(value)}`)
        return
      }
      await sheet.getByRole('button', { name: 'Select text' }).click()
      const reader = page.getByRole('dialog', { name: 'Select text' })
      await reader.waitFor()
      const body = reader.locator('.selectable-message')
      if ((await body.innerText()).includes('**'))
        throw new Error('select text shows raw markdown markers')
      const bold = body.locator('strong', { hasText: 'predictable' })
      if (!(await bold.count()))
        throw new Error('select text did not render markdown')
      const actions = reader
        .getByRole('contentinfo')
        .or(reader.locator('.select-text-actions'))
      for (const name of ['Copy', 'Quote', 'Mention'])
        if (!(await actions.getByRole('button', { name }).isDisabled()))
          throw new Error(`${name} enabled without a selection`)
      await bold.first().evaluate((node) => {
        const range = document.createRange()
        range.selectNodeContents(node)
        const selection = document.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
      })
      await page.waitForTimeout(200)
      for (const name of ['Copy', 'Quote', 'Mention'])
        if (await actions.getByRole('button', { name }).isDisabled())
          throw new Error(`${name} disabled with a selection`)
      if (step === 'view') return
      await actions
        .getByRole('button', { name: step === 'quote' ? 'Quote' : 'Mention' })
        .click()
      await reader.waitFor({ state: 'detached' })
      await page.waitForTimeout(200)
      const value = await composer.inputValue()
      const expected = step === 'quote' ? '> predictable\n\n' : '@predictable '
      if (value !== expected)
        throw new Error(`${step} draft: ${JSON.stringify(value)}`)
      const focused = await composer.evaluate(
        (node) => node === document.activeElement,
      )
      if (!focused) throw new Error(`${step} left the composer unfocused`)
    },
  })),
  {
    // The app's Quote/Mention live in Android's selection toolbar, which ends
    // the selection before its event reaches the page.
    file: 'html-preview-select-text-native-event.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.message',
    async act(page) {
      const message = page.locator('.message').nth(1)
      await message.scrollIntoViewIfNeeded()
      await message.dispatchEvent('contextmenu', {
        button: 2,
        bubbles: true,
        cancelable: true,
      })
      const sheet = page.getByRole('dialog', { name: 'Message actions' })
      await sheet.waitFor()
      await sheet.getByRole('button', { name: 'Select text' }).click()
      const reader = page.getByRole('dialog', { name: 'Select text' })
      await reader.waitFor()
      await reader
        .locator('.selectable-message strong', { hasText: 'predictable' })
        .first()
        .evaluate((node) => {
          const range = document.createRange()
          range.selectNodeContents(node)
          document.getSelection().removeAllRanges()
          document.getSelection().addRange(range)
        })
      await page.waitForTimeout(150)
      await page.evaluate(() => {
        document.getSelection().removeAllRanges()
        window.dispatchEvent(
          new CustomEvent('almaselectionaction', { detail: 'quote' }),
        )
      })
      await reader.waitFor({ state: 'detached' })
      await page.waitForTimeout(200)
      const value = await page
        .locator('.composer textarea')
        .first()
        .inputValue()
      if (value !== '> predictable\n\n')
        throw new Error(`native quote draft: ${JSON.stringify(value)}`)
    },
  },
  {
    file: 'phone-settings.png',
    viewport: PHONE,
    route: '/settings',
    ready: '.settings-switch',
  },
  {
    file: 'phone-settings-theme-picker.png',
    viewport: PHONE,
    route: '/settings',
    ready: '.settings-group',
    async act(page) {
      await page.getByRole('button', { name: /Dark theme/i }).click()
      await page.locator('.theme-list-row').first().waitFor()
    },
  },
  {
    file: 'tablet-settings.png',
    viewport: TABLET,
    route: '/settings',
    ready: '.settings-switch',
  },
  {
    file: 'phone-thread-header-composer.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer',
    async act(page) {
      await page.locator('.composer textarea').fill('A focused composer state')
    },
  },
  {
    file: 'list-chrome-phone-thread-table-timeline.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-long`,
    ready: '.markdown-table-wrap',
  },
  {
    file: 'list-chrome-phone-timeline-dragging.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-long`,
    ready: '.timeline-marker',
    async act(page) {
      const rail = page.locator('.timeline-rail')
      const box = await rail.boundingBox()
      if (!box) throw new Error('timeline rail missing')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.55, {
        steps: 8,
      })
    },
  },
  {
    file: 'list-chrome-tablet-start-view.png',
    viewport: TABLET,
    route: DESKTOP,
    ready: '.split-start-composer',
  },
  {
    file: 'list-chrome-tablet-thread-table-timeline.png',
    viewport: TABLET,
    route: `${DESKTOP}/t-long`,
    ready: '.markdown-table-wrap',
  },
  {
    file: 'attachment-review-thread-markdown-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-long`,
    ready: '.markdown-table-wrap',
    async act(page) {
      await page
        .locator('.markdown-content pre')
        .last()
        .scrollIntoViewIfNeeded()
    },
  },
  {
    file: 'attachment-review-thread-tools-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.tool-card',
    async act(page) {
      await page.locator('.tool-card').first().scrollIntoViewIfNeeded()
    },
  },
  {
    file: 'attachment-review-composer-attachments-queue-editing-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-queue`,
    query: 'queueCount=2',
    ready: '.queue-copy',
    async act(page) {
      await page.locator('.queue-copy').first().click()
      await page
        .getByRole('textbox', { name: 'Edit queued message' })
        .fill('Bump the version with browser verification')
      await page.getByRole('button', { name: 'Add attachment' }).click()
      await page
        .locator('input[type="file"][multiple]:not([accept])')
        .setInputFiles({
          name: 'review-notes.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('attachment visual review'),
        })
      await page.locator('.attachment-chip').waitFor()
      await page
        .locator('.bottom-sheet')
        .getByRole('button', { name: 'Close' })
        .click()
    },
  },
  {
    file: 'attachment-review-anchored-menu-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-long`,
    ready: '.detail-header',
    async act(page) {
      await page.getByRole('button', { name: 'Thread menu' }).click()
      await page.getByRole('menu', { name: 'Thread menu' }).waitFor()
    },
  },
  {
    file: 'attachment-review-bottom-sheet-phone.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-long`,
    ready: '.composer .attach',
    async act(page) {
      await page.getByRole('button', { name: 'Add attachment' }).click()
      await page.getByRole('dialog', { name: 'Add attachment' }).waitFor()
    },
  },
  {
    file: 'attachment-review-settings-phone.png',
    viewport: PHONE,
    route: '/settings',
    ready: '.settings-page',
  },
  {
    file: 'attachment-review-navigation-phone.png',
    viewport: PHONE,
    route: '/settings',
    ready: '.tab-bar',
    async act(page) {
      await assertNavigationWithoutInbox(page, '.tab-bar')
    },
  },
  {
    file: 'long-press-root-titles-phone.png',
    // Short viewport so every root body overflows and would squeeze a
    // shrinkable header.
    viewport: { width: 412, height: 560 },
    route: '/d/fixture-desktop/crystals',
    ready: '.crystals-stats',
    async act(page) {
      const titles = {}
      for (const name of ['Settings', 'Threads', 'Crystals']) {
        await page.locator('.tab-bar').getByRole('link', { name }).click()
        await page.waitForTimeout(500)
        titles[name] = await page.evaluate(() => {
          const title = document.querySelector(
            '.page-header h1, .thread-list-header .desktop-switcher-name',
          )
          const header = title?.closest('header')
          if (!title || !header) throw new Error('root title missing')
          const t = title.getBoundingClientRect()
          return {
            center: (t.top + t.bottom) / 2,
            headerHeight: header.getBoundingClientRect().height,
          }
        })
      }
      const centers = Object.values(titles).map((t) => t.center)
      if (
        Object.values(titles).some(
          (t) => Math.abs(t.headerHeight - 60) > 0.5,
        ) ||
        Math.max(...centers) - Math.min(...centers) > 1
      )
        throw new Error(`root title geometry failed: ${JSON.stringify(titles)}`)
      const pinned = await page.evaluate(async () => {
        // Slots ride with the stats; only Backpack/Formal scroll.
        const stats = document.querySelector(
          '.crystals-pinned .settings-section',
        )
        const body = document.querySelector('.crystals-page-body')
        if (!stats || !(body instanceof HTMLElement))
          throw new Error('crystals targets missing')
        const before = stats.getBoundingClientRect().top
        body.scrollTop = 200
        await new Promise((resolve) => requestAnimationFrame(resolve))
        return {
          before,
          after: stats.getBoundingClientRect().top,
          scrolled: body.scrollTop,
        }
      })
      if (pinned.scrolled < 50 || Math.abs(pinned.before - pinned.after) > 0.5)
        throw new Error(
          `crystals stats did not stay pinned: ${JSON.stringify(pinned)}`,
        )
    },
  },
  {
    file: 'long-press-crystals-title-two-pane.png',
    viewport: TAB_TWO_PANE,
    route: '/d/fixture-desktop/crystals',
    ready: '.crystals-stats',
    async act(page) {
      const geometry = await page.evaluate(() => {
        const center = (selector) => {
          const r = document.querySelector(selector)?.getBoundingClientRect()
          if (!r) throw new Error(`missing ${selector}`)
          return (r.top + r.bottom) / 2
        }
        return {
          sidebar: center('.split-sidebar .desktop-switcher-name'),
          title: center('.split-main .desktop-switcher-name'),
        }
      })
      console.log(
        `crystals two-pane title geometry ${JSON.stringify(geometry)}`,
      )
      if (Math.abs(geometry.sidebar - geometry.title) > 1)
        throw new Error(
          `crystals title misaligned: ${JSON.stringify(geometry)}`,
        )
    },
  },
  {
    file: 'desktop-switcher-static-chrome-two-pane.png',
    viewport: TAB_TWO_PANE,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-long`,
    ready: '.split-sidebar .thread-row.selected',
    async act(page) {
      const result = await page.evaluate(async () => {
        if (typeof document.startViewTransition !== 'function')
          throw new Error('view transitions unavailable')
        const rows = [
          ...document.querySelectorAll('.split-sidebar .thread-row'),
        ]
        const next = rows.find((row) => !row.classList.contains('selected'))
        if (!(next instanceof HTMLElement)) throw new Error('no other thread')
        // The fixture uses MemoryRouter, so drive the same transition the
        // app router starts for a two-pane thread switch.
        document.documentElement.dataset.navMotion = 'fade'
        document.startViewTransition(() => next.click())
        const seen = new Set()
        const until = performance.now() + 600
        while (performance.now() < until) {
          for (const a of document.getAnimations()) {
            const target = a.effect?.pseudoElement
            if (target?.includes('view-transition')) seen.add(target)
          }
          await new Promise((resolve) => requestAnimationFrame(resolve))
        }
        const own = ['.split-rail', '.split-sidebar'].map(
          (selector) =>
            getComputedStyle(document.querySelector(selector))
              .viewTransitionName,
        )
        return { seen: [...seen], own }
      })
      if (!result.seen.some((t) => t.includes('(root)')))
        throw new Error(
          `page transition did not run: ${JSON.stringify(result)}`,
        )
      // Without their own snapshot the rail and list fade with the root.
      if (result.own.join() !== 'alma-rail,alma-sidebar')
        throw new Error(`chrome not isolated: ${JSON.stringify(result)}`)
      if (result.seen.some((t) => /alma-(rail|sidebar|tabbar)/.test(t)))
        throw new Error(`chrome animated: ${JSON.stringify(result)}`)
      console.log('STATIC-CHROME', JSON.stringify(result))
    },
  },
  {
    file: 'safe-area-two-pane-topbar-rest.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-long`,
    ready: '.split-main .detail-header',
    safeInsets: true,
    async act(page) {
      const borders = await page.evaluate(() => {
        const selectors = [
          '.split-rail',
          '.split-sidebar',
          '.split-sidebar .thread-list-header',
          '.split-sidebar .thread-tabs',
          '.split-main .detail-header',
        ]
        return selectors.flatMap((selector) => {
          const node = document.querySelector(selector)
          if (!node) throw new Error(`missing ${selector}`)
          const style = getComputedStyle(node)
          return [style.borderRightWidth, style.borderBottomWidth].map(
            Number.parseFloat,
          )
        })
      })
      if (borders.some((width) => width !== 0))
        throw new Error(`legacy top bar border remains: ${borders.join(',')}`)
    },
  },
  {
    file: 'safe-area-two-pane-topbar-scrolled.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-long`,
    ready: '.split-main .message-scroll',
    safeInsets: true,
    async act(page) {
      await page
        .locator('.split-main .message-scroll')
        .evaluate((node) => node.scrollTo({ top: 200 }))
      await page.waitForTimeout(200)
      const border = await page
        .locator('.split-main .detail-header')
        .evaluate((node) => getComputedStyle(node).borderBottomWidth)
      if (Number.parseFloat(border) !== 0)
        throw new Error(`scrolled header border ${border}`)
    },
  },
  {
    file: 'safe-area-phone-thread-rest.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-long`,
    ready: '.detail-header',
    safeInsets: true,
    async act(page) {
      const result = await page.locator('.detail-header').evaluate((node) => {
        const rect = node.getBoundingClientRect()
        return {
          top: rect.top,
          height: rect.height,
          border: Number.parseFloat(getComputedStyle(node).borderBottomWidth),
        }
      })
      if (
        result.top !== 0 ||
        Math.abs(result.height - 100) > 0.5 ||
        result.border !== 0
      )
        throw new Error(`phone rest top bar failed: ${JSON.stringify(result)}`)
    },
  },
  {
    file: 'safe-area-phone-thread-scrolled.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-long`,
    ready: '.message-scroll',
    safeInsets: true,
    async act(page) {
      await page
        .locator('.message-scroll')
        .evaluate((node) => node.scrollTo({ top: 200 }))
      await page.waitForTimeout(200)
      const border = await page
        .locator('.detail-header')
        .evaluate((node) =>
          Number.parseFloat(getComputedStyle(node).borderBottomWidth),
        )
      if (border !== 0)
        throw new Error(`phone scrolled header border ${border}`)
    },
  },
  {
    file: 'safe-area-settings-no-fullscreen.png',
    viewport: PHONE,
    route: '/settings',
    ready: '.settings-page',
    safeInsets: true,
    async act(page) {
      if (await page.getByText('Full-screen (draw under system bars)').count())
        throw new Error('fullscreen setting still rendered')
    },
  },
  {
    file: 'safe-area-todo-filter.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-list',
    safeInsets: true,
    async act(page) {
      if ((await page.locator('.thread-todo-mark').count()) < 1)
        throw new Error('to-do marks missing from thread rows')
    },
  },
  {
    file: 'edgeToEdge-two-pane-rest.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-long`,
    ready: '.split-main .detail-header',
    safeInsets: true,
    async act(page) {
      const result = await page.evaluate(() => {
        const selectors = [
          '.split-rail',
          '.split-sidebar',
          '.split-sidebar .thread-list-header',
          '.split-sidebar .thread-tabs',
          '.split-main .detail-header',
        ]
        const nodes = selectors.map((selector) => {
          const node = document.querySelector(selector)
          if (!(node instanceof HTMLElement))
            throw new Error(`missing ${selector}`)
          return { selector, node }
        })
        const centerY = (selector) => {
          const rect = document.querySelector(selector)?.getBoundingClientRect()
          if (!rect) throw new Error(`missing ${selector}`)
          return (rect.top + rect.bottom) / 2
        }
        const pseudoSeparators = nodes.flatMap(({ selector, node }) =>
          ['::before', '::after'].map((pseudo) => {
            const style = getComputedStyle(node, pseudo)
            return {
              selector: `${selector}${pseudo}`,
              width: Number.parseFloat(style.width) || 0,
              height: Number.parseFloat(style.height) || 0,
            }
          }),
        )
        const settings = document.querySelector(
          '.split-nav a[title="Settings"]',
        )
        const toggle = document.querySelector('.split-toggle')
        if (!settings || !toggle) throw new Error('rail actions missing')
        return {
          borders: nodes.map(({ selector, node }) => {
            const style = getComputedStyle(node)
            return {
              selector,
              right: Number.parseFloat(style.borderRightWidth),
              bottom: Number.parseFloat(style.borderBottomWidth),
            }
          }),
          pseudoSeparators,
          centers: {
            logo: centerY('.split-logo'),
            sidebar: centerY('.split-sidebar .desktop-switcher-name'),
            main: centerY('.split-main .thread-heading'),
          },
          toggleBottom: toggle.getBoundingClientRect().bottom,
          settingsTop: settings.getBoundingClientRect().top,
        }
      })
      if (
        result.borders.some(({ right, bottom }) => right !== 0 || bottom !== 0)
      )
        throw new Error(
          `column/header borders remain: ${JSON.stringify(result)}`,
        )
      if (
        result.pseudoSeparators.some(
          ({ width, height }) => width === 0.5 || height === 0.5,
        )
      )
        throw new Error(`pseudo separator remains: ${JSON.stringify(result)}`)
      if (
        Math.abs(result.centers.logo - result.centers.sidebar) > 1 ||
        Math.abs(result.centers.logo - result.centers.main) > 1
      )
        throw new Error(`title centers differ: ${JSON.stringify(result)}`)
      if (
        result.toggleBottom > result.settingsTop ||
        result.settingsTop - result.toggleBottom > 14
      )
        throw new Error(
          `toggle is not directly above Settings: ${JSON.stringify(result)}`,
        )
    },
  },
  {
    file: 'edgeToEdge-two-pane-scrolled.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-long`,
    ready: '.split-main .message-scroll',
    safeInsets: true,
    async act(page) {
      await page
        .locator('.split-main .message-scroll')
        .evaluate((node) => node.scrollTo({ top: 240 }))
      await page.waitForTimeout(200)
      const result = await page
        .locator('.split-main .detail-header')
        .evaluate((node) => ({
          border: Number.parseFloat(getComputedStyle(node).borderBottomWidth),
          before: getComputedStyle(node, '::before').height,
          after: getComputedStyle(node, '::after').height,
        }))
      if (
        result.border !== 0 ||
        result.before === '0.5px' ||
        result.after === '0.5px'
      )
        throw new Error(`scrolled separator remains: ${JSON.stringify(result)}`)
    },
  },
  {
    file: 'edgeToEdge-phone-todo-marks.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-list',
    safeInsets: true,
    async act(page) {
      const marks = await page.locator('.thread-todo-mark').count()
      if (marks < 1) throw new Error(`expected to-do marks, found ${marks}`)
    },
  },
  {
    file: 'edgeToEdge-todo-longpress.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-list',
    safeInsets: true,
    hasTouch: true,
    async act(page) {
      const row = page.locator('.thread-row', {
        hasText: 'Accessibility review',
      })
      const box = await row.boundingBox()
      if (!box) throw new Error('to-do row missing')
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await touch(page, 'touchStart', x, y)
      await page.waitForTimeout(500)
      await touch(page, 'touchEnd', x, y)
      await page.getByRole('menu', { name: 'Thread actions' }).waitFor()
      for (const label of [
        'Ship the accessibility review follow-up',
        'Summarize the accessibility review.',
        'Go to message',
        'Mark done',
      ])
        if (!(await page.getByText(label, { exact: true }).count()))
          throw new Error(`missing ${label}`)
    },
  },
  {
    file: 'references-reopen-thread.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-long`,
    query: 'delayThreadMs=1500',
    ready: '.message',
    safeInsets: true,
    async act(page) {
      await page
        .getByRole('button', { name: 'Back to threads', exact: true })
        .click()
      await page
        .locator('.thread-row', { hasText: 'Tablet layout and timeline' })
        .click()
      const startedAt = performance.now()
      await page.locator('.message').first().waitFor({ timeout: 100 })
      const elapsed = performance.now() - startedAt
      if (await page.getByText('Loading the wire…', { exact: true }).count())
        throw new Error('thread loading state appeared during reopen')
      if (await page.locator('.empty').count())
        throw new Error('thread empty state appeared during reopen')
      await page.evaluate((value) => {
        document.documentElement.dataset.referencesReopenMs = value.toFixed(1)
      }, elapsed)
      console.log(
        `references-reopen-thread first-message-ms=${elapsed.toFixed(1)}`,
      )
    },
  },
  {
    file: 'references-list-return.png',
    viewport: PHONE,
    route: DESKTOP,
    query: 'delayListMs=1500',
    ready: '.thread-row',
    safeInsets: true,
    async act(page) {
      await page
        .locator('.thread-row', { hasText: 'Tablet layout and timeline' })
        .click()
      await page.locator('.message').first().waitFor()
      await page
        .getByRole('button', { name: 'Back to threads', exact: true })
        .click()
      await page.locator('.thread-row').first().waitFor({ timeout: 100 })
      if (await page.getByText('Loading the wire…', { exact: true }).count())
        throw new Error('list loading state appeared on return')
    },
  },
  {
    file: 'references-dark-menu.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-row',
    safeInsets: true,
    hasTouch: true,
    async act(page) {
      const row = page.locator('.thread-row').first()
      const box = await row.boundingBox()
      if (!box) throw new Error('thread row missing')
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await touch(page, 'touchStart', x, y)
      await page.waitForTimeout(500)
      await touch(page, 'touchEnd', x, y)
      const menu = page.getByRole('menu', { name: 'Thread actions' })
      await menu.waitFor()
      const shadow = await menu.evaluate(
        (node) => getComputedStyle(node).boxShadow,
      )
      if (themeMode !== 'light' && shadow !== 'none')
        throw new Error(`dark menu shadow is ${shadow}`)
    },
  },
  {
    file: 'theme-scales-todo-marking.png',
    viewport: PHONE,
    route: DESKTOP,
    query: 'pendingTodoDone=1',
    ready: '.thread-list',
    safeInsets: true,
    hasTouch: true,
    async act(page) {
      const row = page.locator('.thread-row', {
        hasText: 'Accessibility review',
      })
      const box = await row.boundingBox()
      if (!box) throw new Error('to-do row missing')
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await touch(page, 'touchStart', x, y)
      await page.waitForTimeout(500)
      await touch(page, 'touchEnd', x, y)
      await page.getByRole('menu', { name: 'Thread actions' }).waitFor()
      await page.getByText('Mark done', { exact: true }).click()
      await row.getByRole('img', { name: 'Marking to-do done' }).waitFor()
      if (await page.getByRole('menu', { name: 'Thread actions' }).count())
        throw new Error('thread actions menu remained open while marking done')
      const floatingProgress = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[role="progressbar"], [class*="progress"]',
          ),
        ]
          .filter((node) => {
            const position = getComputedStyle(node).position
            return position === 'fixed' || position === 'absolute'
          })
          .map((node) => node.className),
      )
      if (floatingProgress.length)
        throw new Error(
          `floating progress remained: ${JSON.stringify(floatingProgress)}`,
        )
    },
  },
  {
    file: 'edgeToEdge-expand-mid-toggle.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-long`,
    ready: '.split-sidebar',
    reducedMotion: 'no-preference',
    async act(page) {
      await page.evaluate(() =>
        localStorage.setItem('alma-mobile.split-sidebar-collapsed.v1', '1'),
      )
      await page.reload()
      await page.locator('.split-shell.collapsed').waitFor()
      const full = await page
        .locator('.split-sidebar-content')
        .evaluate((node) => node.getBoundingClientRect().width)
      await page.getByRole('button', { name: 'Show thread list' }).click()
      await page.waitForTimeout(125)
      const width = await page.locator('.split-sidebar').evaluate((node) => {
        for (const animation of node.getAnimations({ subtree: true }))
          animation.pause()
        return node.getBoundingClientRect().width
      })
      if (!(width > 0 && width < full))
        throw new Error(`toggle midpoint width ${width}/${full}`)
    },
  },
  {
    file: 'edgeToEdge-expand-mid-swipe.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-long`,
    ready: '.split-sidebar',
    hasTouch: true,
    reducedMotion: 'no-preference',
    async act(page) {
      await page.evaluate(() =>
        localStorage.setItem('alma-mobile.split-sidebar-collapsed.v1', '1'),
      )
      await page.reload()
      await page.locator('.split-shell.collapsed').waitFor()
      const full = await page
        .locator('.split-sidebar-content')
        .evaluate((node) => node.getBoundingClientRect().width)
      const main = await page.locator('.split-main').boundingBox()
      if (!main) throw new Error('split main missing')
      const x = main.x + Math.min(48, main.width * 0.2)
      const y = main.y + main.height / 2
      await touch(page, 'touchStart', x, y)
      await touch(page, 'touchMove', x + 20, y)
      await touch(page, 'touchMove', x + full * 0.5, y)
      page.__edgeToEdgeSwipeEnd = { x: x + full * 0.5, y }
      const state = await page.locator('.split-sidebar').evaluate((node) => ({
        width: node.getBoundingClientRect().width,
        shell: node.parentElement?.className,
        inlineWidth: node.parentElement?.style.getPropertyValue(
          '--sidebar-swipe-width',
        ),
        progress: node.parentElement?.style.getPropertyValue(
          '--sidebar-swipe-progress',
        ),
      }))
      if (!(state.width > 0 && state.width < full))
        throw new Error(`swipe midpoint ${JSON.stringify(state)}/${full}`)
    },
    async afterCapture(page) {
      const point = page.__edgeToEdgeSwipeEnd
      if (point) await touch(page, 'touchEnd', point.x, point.y)
    },
  },
  {
    file: 'attachment-review-crystals-phone.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals',
    ready: '.crystals-stats',
    async act(page) {
      const geometry = await page.evaluate(() => {
        const title = document.querySelector('.crystals-page h1')
        const header = document.querySelector('.crystals-page .page-header')
        const card = document.querySelector('.crystals-stats div')
        const value = card?.querySelector('dd')
        const label = card?.querySelector('dt')
        if (!title || !header || !card || !value || !label)
          throw new Error('crystals header targets missing')
        const t = title.getBoundingClientRect()
        const h = header.getBoundingClientRect()
        const c = card.getBoundingClientRect()
        return {
          titleInset: t.left - h.left,
          cardHeight: c.height,
          titleToCards: c.top - h.bottom,
          valueAlign:
            value.getBoundingClientRect().left -
            label.getBoundingClientRect().left,
        }
      })
      console.log(`crystals phone header geometry ${JSON.stringify(geometry)}`)
      // Phone child pages place Back in the 40px leading slot plus the 4px
      // title gap. Pinned stats begin 4px below the fixed header row.
      if (
        Math.abs(geometry.titleInset - 48) > 1 ||
        geometry.cardHeight > 64 ||
        geometry.titleToCards < 4 ||
        Math.abs(geometry.valueAlign) > 1
      )
        throw new Error(
          `crystals header geometry failed: ${JSON.stringify(geometry)}`,
        )
    },
  },
  {
    file: 'project-accordion-desktop-swipe-mid-phone.png',
    viewport: PHONE,
    hasTouch: true,
    reducedMotion: 'no-preference',
    route: DESKTOP,
    ready: '.desktop-strip',
    async act(page) {
      await touchDrag(page, '.desktop-strip', 0, -14, false)
      const visible = await page
        .locator('.desktop-switcher-name')
        .allTextContents()
      if (!visible.includes('Alma@MBA') || !visible.includes('Studio Mini'))
        throw new Error(`desktop swipe names missing: ${visible.join(', ')}`)
    },
  },
  {
    file: 'project-accordion-desktop-swipe-commit-two-pane.png',
    viewport: TAB_TWO_PANE,
    hasTouch: true,
    reducedMotion: 'no-preference',
    route: DESKTOP,
    ready: '.split-sidebar .desktop-strip',
    async act(page) {
      const firstSwipe = await touchDrag(
        page,
        '.split-sidebar .desktop-strip',
        0,
        -20,
        false,
      )
      const beforeRelease = await page
        .locator('.split-sidebar .desktop-switcher-name')
        .first()
        .textContent()
      if (beforeRelease !== 'Alma@MBA')
        throw new Error(`desktop switched before release: ${beforeRelease}`)
      await touch(page, 'touchEnd', firstSwipe.x, firstSwipe.y - 20)
      await page.waitForFunction(
        () =>
          document.querySelector('.split-sidebar .desktop-switcher-name')
            ?.textContent === 'Studio Mini',
      )
      const title = await page
        .locator('.split-sidebar .desktop-switcher-name')
        .first()
        .textContent()
      if (title !== 'Studio Mini')
        throw new Error(`desktop did not switch: ${title}`)
      await touchDrag(page, '.split-sidebar .desktop-strip', 0, -20)
      await page.waitForTimeout(220)
      const last = await page
        .locator('.split-sidebar .desktop-switcher-name')
        .first()
        .textContent()
      if (last === 'Home Lab')
        throw new Error(`hidden desktop entered swipe cycle: ${last}`)
      await page.waitForTimeout(850)
      await page.locator('.split-sidebar .desktop-strip').click()
      await page.getByRole('menu', { name: 'Switch desktop' }).waitFor()
    },
  },
  {
    file: 'project-accordion-sidebar-mid-collapse.png',
    viewport: TAB_TWO_PANE,
    hasTouch: true,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-long`,
    ready: '.split-sidebar .thread-row.selected, .composer-shell',
    async act(page) {
      await page.locator('.composer-shell').waitFor()
      await touchDrag(page, '.split-sidebar', -150, 0, false)
      const geometry = await page.evaluate(() => {
        const sidebar = document.querySelector('.split-sidebar')
        const shell = document.querySelector('.split-shell')
        if (
          !(sidebar instanceof HTMLElement) ||
          !(shell instanceof HTMLElement)
        )
          throw new Error('sidebar gesture geometry missing')
        return {
          width: sidebar.getBoundingClientRect().width,
          progress: Number.parseFloat(
            shell.style.getPropertyValue('--sidebar-swipe-progress'),
          ),
        }
      })
      if (!(
        geometry.width > 0 &&
        geometry.progress > 0 &&
        geometry.progress < 1
      ))
        throw new Error(`sidebar did not follow: ${JSON.stringify(geometry)}`)
      await assertComposerCentered(page)
    },
  },
  {
    file: 'project-accordion-sidebar-expanded-after-gestures.png',
    viewport: TAB_TWO_PANE,
    hasTouch: true,
    reducedMotion: 'no-preference',
    route: `${DESKTOP}/t-long`,
    ready: '.split-sidebar .thread-row.selected, .composer-shell',
    async act(page) {
      await page.locator('.composer-shell').waitFor()
      await slowTouchDrag(page, '.split-sidebar', -40, 18)
      await page.waitForTimeout(300)
      if (await page.locator('.split-shell.collapsed').count())
        throw new Error('below-threshold swipe collapsed sidebar')
      await page.waitForTimeout(300)
      await slowTouchDrag(page, '.split-rail', -220, 0)
      await page.waitForTimeout(400)
      const collapseClass = await page
        .locator('.split-shell')
        .getAttribute('class')
      if (!collapseClass?.includes('collapsed'))
        throw new Error(
          `past-threshold swipe did not collapse: ${collapseClass}`,
        )
      const main = page.locator('.split-main')
      const box = await main.boundingBox()
      if (!box) throw new Error('main pane missing')
      const expandX = box.x + box.width * 0.2
      const expandY = box.y + box.height * 0.5
      await touch(page, 'touchStart', expandX, expandY)
      for (let step = 1; step <= 6; step += 1) {
        await touch(page, 'touchMove', expandX + 30 * step, expandY)
        await page.waitForTimeout(40)
      }
      await touch(page, 'touchEnd', expandX + 180, expandY)
      await page.waitForTimeout(400)
      if (await page.locator('.split-shell.collapsed').count())
        throw new Error('past-threshold swipe did not expand on release')
      const before = await page.locator('.split-shell').getAttribute('class')
      const horizontal = page.locator('.message pre').last()
      if (!(await horizontal.count()))
        throw new Error('horizontal code block missing')
      await horizontal.evaluate((node) => {
        node.style.width = '140px'
        node.style.maxWidth = '140px'
      })
      const codeScrollBefore = await horizontal.evaluate((node) => {
        node.scrollLeft = 20
        return node.scrollLeft
      })
      if (codeScrollBefore <= 0)
        throw new Error('code block did not become horizontally scrollable')
      await touchDrag(page, '.message pre:last-of-type', -80, 0)
      const list = page.locator('.split-sidebar .threads-page-body')
      const listBox = await list.boundingBox()
      if (listBox) {
        await touch(page, 'touchStart', listBox.x + 40, listBox.y + 180)
        await touch(page, 'touchMove', listBox.x + 42, listBox.y + 80)
        await touch(page, 'touchEnd', listBox.x + 42, listBox.y + 80)
      }
      const after = await page.locator('.split-shell').getAttribute('class')
      if (before !== after || after?.includes('collapsed'))
        throw new Error(
          `excluded/vertical gesture toggled sidebar: ${before} -> ${after}`,
        )
      await assertComposerCentered(page)
    },
  },
  {
    file: 'attachment-review-list-thread-two-pane.png',
    viewport: TAB_TWO_PANE,
    route: `${DESKTOP}/t-long`,
    ready: '.split-sidebar .thread-row.selected',
  },
  ...[
    {
      file: 'hidden-settings-collapsed-360.png',
      viewport: { width: 360, height: 800 },
    },
    { file: 'hidden-settings-collapsed-884.png', viewport: TABLET },
  ].map(({ file, viewport }) => ({
    file,
    viewport,
    route: '/settings',
    ready: '.desktop-list',
    reducedMotion: 'no-preference',
    async act(page) {
      const text = await page.locator('.desktop-list').innerText()
      if (!text.includes('Hidden (1)') || text.includes('Home Lab'))
        throw new Error(`hidden group did not start collapsed: ${text}`)
      await assertNoHorizontalOverflow(page, '.desktop-list')
    },
  })),
  ...[
    {
      file: 'hidden-settings-expanded-360.png',
      viewport: { width: 360, height: 800 },
    },
    { file: 'hidden-settings-expanded-884.png', viewport: TABLET },
  ].map(({ file, viewport }) => ({
    file,
    viewport,
    route: '/settings',
    ready: '.desktop-list',
    reducedMotion: 'no-preference',
    async act(page) {
      await page.getByRole('button', { name: 'Expand hidden desktops' }).click()
      await page.getByText('Home Lab', { exact: true }).waitFor()
      await assertNoHorizontalOverflow(page, '.desktop-list')
    },
  })),
  {
    file: 'copy-layout-settings-desktops.png',
    viewport: PHONE,
    route: '/settings',
    ready: '.desktop-list',
    async act(page) {
      const text = await page.locator('.desktop-list').innerText()
      if (!text.includes('Current desktop'))
        throw new Error(`current desktop copy missing: ${text}`)
      if (text.includes('Online'))
        throw new Error(`normal online state repeated: ${text}`)
    },
  },
  {
    file: 'copy-layout-settings-desktop-error.png',
    viewport: PHONE,
    route: '/settings',
    query: 'status=relay-error',
    ready: '.desktop-list',
    async act(page) {
      await page
        .getByText("Can't reach the relay", { exact: true })
        .first()
        .waitFor()
    },
  },
  ...[
    {
      file: 'hidden-desktop-switcher-360.png',
      viewport: { width: 360, height: 800 },
    },
    { file: 'hidden-desktop-switcher-884.png', viewport: TABLET },
  ].map(({ file, viewport }) => ({
    file,
    viewport,
    route: DESKTOP,
    ready: '.desktop-switcher',
    reducedMotion: 'no-preference',
    async act(page) {
      await page.locator('.desktop-switcher').first().click()
      const menu = page.getByRole('menu', { name: 'Switch desktop' }).first()
      await menu.waitFor()
      const text = await menu.innerText()
      if (text.includes('Home Lab'))
        throw new Error(`hidden desktop appeared in switcher: ${text}`)
      await assertNoHorizontalOverflow(page, '[role="menu"]')
    },
  })),
  {
    file: 'copy-layout-desktop-switcher.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.desktop-switcher',
    async act(page) {
      await page.locator('.desktop-switcher').click()
      await page.getByRole('menu', { name: 'Switch desktop' }).waitFor()
      const text = await page
        .getByRole('menu', { name: 'Switch desktop' })
        .innerText()
      if (text.includes('Online'))
        throw new Error(`online detail repeated: ${text}`)
    },
  },
  {
    file: 'copy-layout-thread-idle.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-ctx`,
    ready: '.thread-subtitle',
    async act(page) {
      const text = await page.locator('.thread-subtitle').innerText()
      if (text.includes('Alma@MBA'))
        throw new Error(`desktop repeated in header: ${text}`)
    },
  },
  {
    file: 'copy-layout-thread-generating.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.thread-generating time',
    async act(page) {
      await assertSeparatedSiblings(page)
    },
  },
  {
    file: 'copy-layout-handoff-approval.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.inline-handoff .inbox-card',
  },
  {
    file: 'copy-layout-crew-sheet.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.detail-header',
    async act(page) {
      await page.getByRole('button', { name: /agents running|Crew/ }).click()
      await page.getByRole('dialog', { name: 'Crew' }).waitFor()
      await assertSeparatedSiblings(page)
    },
  },
  {
    file: 'copy-layout-crystals-list.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals',
    ready: '.crystal-row',
  },
  {
    file: 'copy-layout-loop-goal.png',
    viewport: PHONE,
    route: `${DESKTOP}/t-gen`,
    ready: '.composer-loop-strip',
  },
  {
    file: 'end-resources-crystals-phone-child.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals',
    ready: '.scoped-child-header',
    async act(page) {
      if (!(await page.getByRole('button', { name: 'Back' }).count()))
        throw new Error('phone Crystals Back missing')
      if (await page.locator('.scoped-child-header .desktop-switcher').count())
        throw new Error('phone Crystals unexpectedly shows desktop switcher')
      await assertSeparatedSiblings(page)
    },
  },
  {
    file: 'scoped-headers-crystals-empty.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/crystals',
    fixture: 'empty-crystals',
    ready: '.crystals-page',
  },
  {
    file: 'end-resources-timeclues-phone-child.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/time-clues',
    ready: '.scoped-child-header',
    async act(page) {
      if (!(await page.getByRole('button', { name: 'Back' }).count()))
        throw new Error('phone Time clues Back missing')
      if (await page.locator('.scoped-child-header .desktop-switcher').count())
        throw new Error('phone Time clues unexpectedly shows desktop switcher')
      await assertSeparatedSiblings(page)
    },
  },
  {
    file: 'end-resources-references-phone-child.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/references',
    ready: '.reference-row',
    async act(page) {
      if (!(await page.getByRole('button', { name: 'Back' }).count()))
        throw new Error('phone references Back missing')
      if (await page.locator('.scoped-child-header .desktop-switcher').count())
        throw new Error('phone References unexpectedly shows desktop switcher')
      await assertSeparatedSiblings(page)
    },
  },
  {
    file: 'markdown-preview-refs-missing.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/references',
    ready: '.reference-row',
    async act(page) {
      // Deleted targets fold under the list instead of mixing with live rows.
      const toggle = page.getByRole('button', { name: '2 missing' })
      await toggle.waitFor()
      const live = await page
        .locator('.reference-list:not(.reference-list-missing) .reference-row')
        .count()
      if ((await page.locator('.reference-row.missing').count()) !== 0)
        throw new Error('missing references shown before expanding')
      await toggle.click()
      const missing = await page
        .locator('.reference-row.missing')
        .allInnerTexts()
      if (
        missing.length !== 2 ||
        !missing.every((row) => row.includes('No longer exists')) ||
        !missing[0].includes('Michels')
      )
        throw new Error(`missing rows: ${JSON.stringify(missing)}`)
      if (live < 1) throw new Error('no live references left')
    },
  },
  {
    file: 'scoped-headers-refs-search.png',
    viewport: PHONE,
    route: '/d/fixture-desktop/references',
    ready: '.references-search',
    async act(page) {
      await page
        .getByRole('searchbox', { name: 'Search references' })
        .fill('split')
      await page.waitForTimeout(300)
      await page.locator('.reference-row').first().waitFor()
      await assertSeparatedSiblings(page)
    },
  },
  {
    file: 'scoped-headers-refs-detail.png',
    viewport: PHONE,
    route: `/d/fixture-desktop/references/${encodeURIComponent('alma://thread/t-long/message/m1')}`,
    ready: '.reference-card',
    async act(page) {
      await page.getByText('Referenced by', { exact: true }).waitFor()
      await assertSeparatedSiblings(page)
    },
  },
  {
    file: 'end-resources-crystals-two-pane-root.png',
    viewport: TAB_TWO_PANE,
    route: '/d/fixture-desktop/crystals',
    ready: '.split-main .scoped-root-header',
    async act(page) {
      if (await page.locator('.split-main .scoped-root-back').count())
        throw new Error('split Crystals unexpectedly shows Back')
      if (await page.locator('.split-main .desktop-switcher').count())
        throw new Error('split Crystals unexpectedly shows header switcher')
    },
  },
  {
    file: 'end-resources-references-two-pane-root.png',
    viewport: TAB_TWO_PANE,
    route: '/d/fixture-desktop/references',
    ready: '.references-entry.active',
    async act(page) {
      if (await page.locator('.split-main .scoped-root-back').count())
        throw new Error('split References unexpectedly shows Back')
      if (await page.locator('.split-main .desktop-switcher').count())
        throw new Error('split References unexpectedly shows header switcher')
      if (!(await page.locator('.split-sidebar .desktop-strip').count()))
        throw new Error('split References sidebar desktop strip missing')
      await assertSeparatedSiblings(page)
    },
  },
]

// Facts that used to be joined by a middot sit in flex rows with a gap.
// A later, more specific display rule can silently drop the gap, so measure.
async function assertAgentPaneGeometry(page) {
  await assertNoHorizontalOverflow(page, '.agent-pane-page')
  const geometry = await page.evaluate(() => {
    const pane = document.querySelector('.agent-pane-page')
    const composer = document.querySelector('.agent-composer')
    const terminal = document.querySelector('.agent-terminal-area')
    const firstKey = document.querySelector('.agent-terminal-keys .chip-button')
    const composerChip = document.querySelector('.agent-composer-mode')
    if (!(pane instanceof HTMLElement) || !(composer instanceof HTMLElement))
      throw new Error('agent pane geometry target missing')
    const paneRect = pane.getBoundingClientRect()
    const composerRect = composer.getBoundingClientRect()
    const terminalRect = terminal?.getBoundingClientRect()
    const firstKeyRect = firstKey?.getBoundingClientRect()
    const keyRowRect = firstKey
      ?.closest('.agent-terminal-keys')
      ?.getBoundingClientRect()
    const composerChipRect = composerChip?.getBoundingClientRect()
    return {
      paneLeft: paneRect.left,
      composerLeft: composerRect.left,
      paneRight: paneRect.right,
      composerRight: composerRect.right,
      terminalLeft: terminalRect?.left,
      firstKeyLeft: firstKeyRect?.left,
      composerChipLeft: composerChipRect?.left,
      terminalToKeys:
        terminalRect && keyRowRect
          ? keyRowRect.top - terminalRect.bottom
          : null,
      keysToComposer: keyRowRect ? composerRect.top - keyRowRect.bottom : null,
    }
  })
  if (Math.abs(geometry.paneLeft - geometry.composerLeft) > 1)
    throw new Error(`agent composer left mismatch: ${JSON.stringify(geometry)}`)
  if (Math.abs(geometry.paneRight - geometry.composerRight) > 1)
    throw new Error(
      `agent composer right mismatch: ${JSON.stringify(geometry)}`,
    )
  if (
    geometry.terminalLeft !== undefined &&
    geometry.firstKeyLeft !== undefined &&
    Math.abs(geometry.terminalLeft - geometry.firstKeyLeft) > 1
  )
    throw new Error(
      `agent terminal/key inset mismatch: ${JSON.stringify(geometry)}`,
    )
  if (
    geometry.composerChipLeft !== undefined &&
    geometry.firstKeyLeft !== undefined &&
    Math.abs(geometry.composerChipLeft - geometry.firstKeyLeft) > 1
  )
    throw new Error(
      `agent key/composer inset mismatch: ${JSON.stringify(geometry)}`,
    )
  if (
    geometry.terminalToKeys !== null &&
    geometry.keysToComposer !== null &&
    Math.abs(geometry.terminalToKeys - geometry.keysToComposer) > 2
  )
    throw new Error(
      `agent terminal vertical gaps mismatch: ${JSON.stringify(geometry)}`,
    )
}

async function assertSeparatedSiblings(page) {
  const tight = await page.evaluate(() => {
    const out = []
    for (const row of document.querySelectorAll(
      '.crew-run-meta, .crew-run-heading, .thread-generating, .reasoning-label, .request-eyebrow',
    )) {
      const kids = [...row.children].filter(
        (el) => el.getBoundingClientRect().width > 0,
      )
      for (let i = 1; i < kids.length; i++) {
        const a = kids[i - 1].getBoundingClientRect()
        const b = kids[i].getBoundingClientRect()
        if (Math.abs(a.top - b.top) < 4 && b.left - a.right < 4)
          out.push(
            `${row.className}: "${kids[i - 1].textContent}" | "${kids[i].textContent}" gap ${(b.left - a.right).toFixed(1)}`,
          )
      }
    }
    return out
  })
  if (tight.length)
    throw new Error(`Separated facts touch:\n${tight.join('\n')}`)
}

const GTD = '/d/fixture-desktop/gtd'

async function rootHeaderGeometry(page) {
  return page.evaluate(() => {
    const title = document.querySelector('.scoped-root-header h1')
    const tabs = document.querySelector('.tab-bar-list')
    const indicator = tabs?.querySelector('.tab-bar-indicator')
    if (
      !(title instanceof HTMLElement) ||
      !(tabs instanceof HTMLElement) ||
      !(indicator instanceof HTMLElement)
    )
      throw new Error('root header geometry target missing')
    const titleRect = title.getBoundingClientRect()
    const tabsRect = tabs.getBoundingClientRect()
    const indicatorRect = indicator.getBoundingClientRect()
    const header = title.closest('header')
    return {
      titleTop: titleRect.top,
      tabTop: tabsRect.top,
      headerOverflow: header
        ? header.scrollWidth - header.clientWidth
        : Infinity,
      indicatorTop: indicatorRect.top,
      visibleHeight:
        Math.min(indicatorRect.bottom, tabsRect.bottom) -
        Math.max(indicatorRect.top, tabsRect.top),
    }
  })
}

let threadsRootGeometry

async function holdRow(page, title) {
  const row = page.locator('.gtd-list .thread-row', { hasText: title }).last()
  // Rows shift while favorites and counts settle after load; a hold that
  // starts on a moving row is cancelled, so wait for two equal boxes.
  let box = await row.boundingBox()
  for (let tries = 0; tries < 20; tries += 1) {
    await page.waitForTimeout(150)
    const next = await row.boundingBox()
    if (box && next && next.x === box.x && next.y === box.y) break
    box = next
  }
  if (!box) throw new Error(`GTD row missing: ${title}`)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await touch(page, 'touchStart', x, y)
  await page.waitForTimeout(800) // well past the 450 ms hold, even on a busy machine
  await touch(page, 'touchEnd', x, y)
  await page.getByRole('menu', { name: 'Thread actions' }).waitFor()
}

// GTD first batch: segments, favorites, autoTodo, inbox fold, swipe, and the
// Threads header Crystals entry. All data is the synthetic fixture.
// Agents board/list/split shots (feat/agents-board).
const agentsBoardShots = ['en', 'zh'].flatMap((lang) => [
  {
    file: `agents-board-${lang}-412.png`,
    viewport: PHONE,
    route: '/d/fixture-desktop/agents',
    language: lang,
    ready: '.agents-board .agent-pane-row',
    safeInsets: true,
    async act(page) {
      await page.evaluate(() =>
        localStorage.setItem('alma.agents.view-mode', 'board'),
      )
      await page.reload()
      await page.locator('.agents-board .agent-pane-row').first().waitFor()
      await assertNoHorizontalOverflow(page, '.agents-page-body')
      if ((await page.locator('.agent-project-tab').count()) < 4)
        throw new Error('Agents board needs at least four workspaces')
      if (!(await page.locator('.tab-bar .agents-entry').count()))
        throw new Error('phone Agents navigation entry missing')
    },
  },
  ...(lang === 'en'
    ? [
        {
          file: 'agents-list-en-412.png',
          viewport: PHONE,
          route: '/d/fixture-desktop/agents',
          language: lang,
          ready: '.agent-pane-row',
          safeInsets: true,
          async act(page) {
            await page.evaluate(() =>
              localStorage.setItem('alma.agents.view-mode', 'list'),
            )
            await page.reload()
            await page.locator('.agents-list .agent-pane-row').first().waitFor()
            await assertNoHorizontalOverflow(page, '.agents-page-body')
          },
        },
        {
          file: 'agents-split-en-884.png',
          viewport: TABLET,
          route: '/d/fixture-desktop/agents/w1%3Ap1',
          language: lang,
          ready: '.split-sidebar .agent-pane-row.selected',
          safeInsets: true,
          async act(page) {
            await page.evaluate(() =>
              localStorage.setItem('alma.agents.view-mode', 'board'),
            )
            await page.reload()
            await page
              .locator('.split-sidebar .agent-pane-row.selected')
              .waitFor()
            await page.locator('.split-main .agent-pane-page').waitFor()
            await assertNoHorizontalOverflow(page, '.split-shell')
          },
        },
      ]
    : []),
])

const agentsStateShots = [
  ['unsupported', PHONE, 'zh'],
  ['unreachable', TABLET, 'en'],
].map(([state, viewport, language]) => ({
  file: `agents-${state}-${language}-${viewport.width}.png`,
  viewport,
  route: '/d/fixture-desktop/agents',
  fixture: `agents-${state}`,
  language,
  ready: '.agents-state',
  safeInsets: true,
  async act(page) {
    await page.locator('.agents-state').waitFor()
    await assertNoHorizontalOverflow(
      page,
      viewport === PHONE ? '.agents-page-body' : '.split-shell',
    )
  },
}))

const herdrShots = [
  ...agentsBoardShots,
  ...agentsStateShots,
  ...['en', 'zh'].flatMap((lang) => {
    const terminalLabel = lang === 'zh' ? '终端' : 'Terminal'
    const gridLabel =
      lang === 'zh' ? '显示原始终端网格' : 'Show the original terminal grid'
    return [
      {
        file: `herdr-agents-${lang}-412.png`,
        viewport: PHONE,
        route: '/d/fixture-desktop/agents',
        language: lang,
        ready: '.agent-pane-row',
        safeInsets: true,
        async act(page) {
          await assertNoHorizontalOverflow(page, '.agents-page-body')
          if (!(await page.locator('.tab-bar .agents-entry').count()))
            throw new Error('phone Agents navigation entry missing')
        },
      },
      {
        file: `herdr-pane-chat-${lang}-412.png`,
        viewport: PHONE,
        route: '/d/fixture-desktop/agents/w1%3Ap1',
        language: lang,
        ready: '.agent-message',
        safeInsets: true,
        async act(page) {
          await assertAgentPaneGeometry(page)
        },
      },
      {
        file: `herdr-pane-terminal-reflow-${lang}-412.png`,
        viewport: PHONE,
        deviceScaleFactor: 2,
        route: '/d/fixture-desktop/agents/w1%3Ap1',
        language: lang,
        ready: '.agent-message',
        safeInsets: true,
        async act(page) {
          await page.getByRole('button', { name: terminalLabel }).click()
          await page.locator('.agent-terminal .xterm-rows').waitFor()
          await page.locator('.agent-terminal-keys').waitFor()
          await assertAgentPaneGeometry(page)
        },
      },
      ...(lang === 'zh'
        ? [
            {
              file: 'herdr-pane-terminal-history-zh-412.png',
              viewport: PHONE,
              deviceScaleFactor: 2,
              route: '/d/fixture-desktop/agents/w1%3Ap1',
              language: lang,
              ready: '.agent-message',
              safeInsets: true,
              async act(page) {
                await page.getByRole('button', { name: terminalLabel }).click()
                await page.getByRole('button', { name: '加载更早输出' }).click()
                const history = page.locator('.agent-terminal-history')
                await history
                  .getByText(/history line 1/)
                  .first()
                  .waitFor()
                await page
                  .locator('.agent-terminal-scroll')
                  .evaluate((element) => {
                    element.scrollTop = 0
                  })
                await page.waitForFunction(() => {
                  const history = document.querySelector(
                    '.agent-terminal-history',
                  )
                  const scroller = document.querySelector(
                    '.agent-terminal-scroll',
                  )
                  if (
                    !(history instanceof HTMLElement) ||
                    !(scroller instanceof HTMLElement)
                  )
                    return false
                  return (
                    scroller.scrollTop === 0 &&
                    history.dataset.historyFirstLine?.includes(
                      'history line 1',
                    ) &&
                    history.getBoundingClientRect().top >=
                      scroller.getBoundingClientRect().top - 1
                  )
                })
                await page
                  .locator('.agent-terminal-scroll')
                  .evaluate((element) => {
                    element.scrollTop = element.scrollHeight
                  })
                await assertAgentPaneGeometry(page)
              },
            },
          ]
        : []),
      {
        file: `herdr-pane-terminal-grid-${lang}-412.png`,
        viewport: PHONE,
        deviceScaleFactor: 2,
        route: '/d/fixture-desktop/agents/w1%3Ap1',
        language: lang,
        ready: '.agent-message',
        safeInsets: true,
        async act(page) {
          await page.getByRole('button', { name: terminalLabel }).click()
          await page.getByRole('button', { name: gridLabel }).click()
          await page.locator('.agent-terminal .xterm-rows').waitFor()
          await assertAgentPaneGeometry(page)
        },
      },
      ...(lang === 'en'
        ? [
            {
              file: 'herdr-pane-chat-en-884.png',
              viewport: TABLET,
              route: '/d/fixture-desktop/agents/w1%3Ap1',
              language: lang,
              ready: '.agent-message',
              safeInsets: true,
              async act(page) {
                await assertAgentPaneGeometry(page)
              },
            },
            {
              file: 'herdr-pane-terminal-reflow-en-884.png',
              viewport: TABLET,
              deviceScaleFactor: 2,
              route: '/d/fixture-desktop/agents/w1%3Ap1',
              language: lang,
              ready: '.agent-message',
              safeInsets: true,
              async act(page) {
                await page.getByRole('button', { name: terminalLabel }).click()
                await page.locator('.agent-terminal .xterm-rows').waitFor()
                await assertAgentPaneGeometry(page)
              },
            },
            {
              file: 'herdr-pane-terminal-grid-en-884.png',
              viewport: TABLET,
              deviceScaleFactor: 2,
              route: '/d/fixture-desktop/agents/w1%3Ap1',
              language: lang,
              ready: '.agent-message',
              safeInsets: true,
              async act(page) {
                await page.getByRole('button', { name: terminalLabel }).click()
                await page.getByRole('button', { name: gridLabel }).click()
                await page.locator('.agent-terminal .xterm-rows').waitFor()
                await assertAgentPaneGeometry(page)
              },
            },
          ]
        : []),
      {
        file: `herdr-blocked-${lang}-412.png`,
        viewport: PHONE,
        deviceScaleFactor: 2,
        route: '/d/fixture-desktop/agents/w1%3Ap1',
        language: lang,
        query: 'agentState=blocked',
        ready: '.agent-blocked-card',
        safeInsets: true,
        async act(page) {
          await assertAgentPaneGeometry(page)
        },
      },
      ...(lang === 'zh'
        ? [
            {
              file: 'herdr-terminal-typing-zh-412.png',
              viewport: PHONE,
              deviceScaleFactor: 2,
              route: '/d/fixture-desktop/agents/w1%3Ap1',
              language: lang,
              ready: '.agent-message',
              safeInsets: true,
              async act(page) {
                await page.getByRole('button', { name: '终端' }).click()
                await page.locator('.agent-composer-mode').waitFor()
                await assertNoHorizontalOverflow(page, '.agent-pane-page')
              },
            },
            {
              file: 'herdr-blocked-zh-884.png',
              viewport: TABLET,
              deviceScaleFactor: 2,
              route: '/d/fixture-desktop/agents/w1%3Ap1',
              language: lang,
              query: 'agentState=blocked',
              ready: '.agent-blocked-card',
              safeInsets: true,
              async act(page) {
                await assertAgentPaneGeometry(page)
              },
            },
          ]
        : []),
    ]
  }),
]

const phoneGtdNavigationShots = ['en', 'zh'].flatMap((language) => {
  const labels =
    language === 'zh'
      ? {
          bottom: ['对话', 'Herdr', '设置'],
          header: ['资料库', 'GTD', '搜索', '新对话'],
        }
      : {
          bottom: ['Threads', 'Herdr', 'Settings'],
          header: ['Library', 'GTD', 'Search', 'New thread'],
        }
  return [
    {
      file: `thread-list-gtd-header-${language}-412.png`,
      viewport: PHONE,
      route: DESKTOP,
      language,
      ready: '.thread-list-header',
      safeInsets: true,
      async act(page) {
        const bottomLabels = await page.locator('.tab-bar a').allTextContents()
        if (bottomLabels.join('|') !== labels.bottom.join('|'))
          throw new Error(`phone bottom navigation: ${bottomLabels.join('|')}`)
        const headerLabels = await page
          .locator('.thread-header-actions button')
          .evaluateAll((buttons) =>
            buttons.map((button) => button.getAttribute('aria-label')),
          )
        if (headerLabels.join('|') !== labels.header.join('|'))
          throw new Error(`Threads header actions: ${headerLabels.join('|')}`)
        await assertNoHorizontalOverflow(page, '.thread-list-header')
      },
    },
    {
      file: `gtd-via-header-${language}-412.png`,
      viewport: PHONE,
      route: DESKTOP,
      language,
      ready: '.thread-list-header',
      safeInsets: true,
      async act(page) {
        await page.getByRole('button', { name: 'GTD', exact: true }).click()
        await page.locator('.gtd-page .gtd-list .thread-row').first().waitFor()
        if (await page.locator('.threads-page').count())
          throw new Error('Threads root remained after GTD header navigation')
        const bottomLabels = await page.locator('.tab-bar a').allTextContents()
        if (bottomLabels.join('|') !== labels.bottom.join('|'))
          throw new Error(`GTD bottom navigation: ${bottomLabels.join('|')}`)
        await assertNoHorizontalOverflow(page, '.gtd-page')
      },
    },
  ]
})

const unfoldedGtdRailShots = ['en', 'zh'].map((language) => ({
  file: `navigation-gtd-rail-${language}-884.png`,
  viewport: TABLET,
  route: GTD,
  language,
  ready: '.split-nav',
  safeInsets: true,
  async act(page) {
    const expected =
      language === 'zh'
        ? ['对话', 'GTD', 'Herdr', '设置']
        : ['Threads', 'GTD', 'Herdr', 'Settings']
    const labels = await page
      .locator('.split-nav a')
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute('aria-label')),
      )
    const roots = labels.filter((label) => expected.includes(label))
    if (roots.join('|') !== expected.join('|'))
      throw new Error(`split navigation: ${labels.join('|')}`)
    await assertNoHorizontalOverflow(page, '.split-shell')
  },
}))

const gtdShots = [
  ...phoneGtdNavigationShots,
  ...unfoldedGtdRailShots,
  {
    file: 'gtd-phone-todo-favorites.png',
    viewport: PHONE,
    route: GTD,
    ready: '.gtd-page .gtd-list .thread-row',
    safeInsets: true,
    async act(page) {
      const geometry = await rootHeaderGeometry(page)
      console.log(`GTD root geometry ${JSON.stringify(geometry)}`)
      if (!threadsRootGeometry) {
        await page.goto(fixtureUrl(DESKTOP))
        await page.waitForFunction(() => Boolean(window.__almaSetNativeInsets))
        await page.evaluate(
          ({ insets }) =>
            window.__almaSetNativeInsets?.(insets, {
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }),
          { insets: simulatedNativeInsets },
        )
        await page.locator('.threads-page .thread-list').waitFor()
        threadsRootGeometry = await rootHeaderGeometry(page)
        await page.goto(fixtureUrl(GTD))
        await page.waitForFunction(() => Boolean(window.__almaSetNativeInsets))
        await page.evaluate(
          ({ insets }) =>
            window.__almaSetNativeInsets?.(insets, {
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }),
          { insets: simulatedNativeInsets },
        )
        await page.locator('.gtd-page .gtd-list .thread-row').first().waitFor()
      }
      for (const key of ['titleTop', 'tabTop', 'indicatorTop'])
        if (Math.abs(geometry[key] - threadsRootGeometry[key]) > 0.5)
          throw new Error(
            `Threads/GTD ${key} mismatch: ${threadsRootGeometry[key]} vs ${geometry[key]}`,
          )
      if (
        geometry.headerOverflow > 0.5 ||
        threadsRootGeometry.headerOverflow > 0.5
      )
        throw new Error(
          `Threads/GTD header overflow: ${threadsRootGeometry.headerOverflow} vs ${geometry.headerOverflow}`,
        )
      if (
        Math.abs(geometry.visibleHeight - 2) > 0.1 ||
        Math.abs(threadsRootGeometry.visibleHeight - 2) > 0.1
      )
        throw new Error(
          `Threads/GTD indicator visible height mismatch: ${threadsRootGeometry.visibleHeight} vs ${geometry.visibleHeight}`,
        )
      await assertTabIndicatorGeometry(page, '.gtd-page .tab-bar-list')
      const tabs = await page
        .locator('.gtd-page .tab-bar-list [role="tab"] .tab-bar-label')
        .allTextContents()
      const selectedLabel = await page
        .locator('.gtd-page .tab-bar-list [aria-selected="true"]')
        .getAttribute('aria-label')
      if (tabs.length !== 1 || !selectedLabel?.startsWith(`${tabs[0]}, `))
        throw new Error(
          `GTD visible labels: ${tabs.join('|')} selected ${selectedLabel}`,
        )
      const tabNames = await page
        .locator('.gtd-page .tab-bar-list [role="tab"]')
        .evaluateAll((tabs) =>
          tabs.map((tab) => tab.getAttribute('aria-label')),
        )
      for (const name of ['Inbox', 'To-do', 'In progress', 'Done'])
        if (!tabNames.some((label) => label?.startsWith(`${name}, `)))
          throw new Error(`GTD accessible labels: ${tabNames.join('|')}`)
      const tabGeometry = await page
        .locator('.gtd-page .tab-bar-list [role="tab"]')
        .evaluateAll((tabs) => {
          const list = tabs[0]?.parentElement
          return {
            overflow: list ? list.scrollWidth - list.clientWidth : Infinity,
            centers: tabs.map((tab) => {
              const parts = [
                tab.querySelector('svg'),
                tab.querySelector('.tab-bar-label'),
                tab.querySelector('small'),
              ].filter(Boolean)
              const centers = parts.map((part) => {
                const rect = part.getBoundingClientRect()
                return rect.top + rect.height / 2
              })
              return Math.max(...centers) - Math.min(...centers)
            }),
          }
        })
      if (tabGeometry.overflow > 0.5)
        throw new Error(`GTD tab overflow: ${tabGeometry.overflow}`)
      if (
        await page
          .locator('.gtd-page .tab-bar-list')
          .evaluate((node) => node.classList.contains('compact'))
      )
        throw new Error(
          `phone GTD tabs compacted unexpectedly: ${JSON.stringify(
            await page.locator('.gtd-page .tab-bar-list').evaluate((node) => ({
              clientWidth: node.clientWidth,
              measureWidth: node.querySelector('.tab-bar-full-measure')
                ?.scrollWidth,
            })),
          )}`,
        )
      if (tabGeometry.centers.some((difference) => difference > 1))
        throw new Error(
          `GTD tab count not baseline-aligned: ${tabGeometry.centers.join('|')}`,
        )
      if (!(await page.getByRole('button', { name: /^Archived, / }).count()))
        throw new Error('GTD archive header button missing')
      const favorites = await page
        .locator('section[aria-label="Favorites"] .thread-row h2')
        .allTextContents()
      if (favorites[0] !== 'Tablet layout and timeline')
        throw new Error(`pinned favorite not first: ${favorites.join('|')}`)
      if (!(await page.locator('.thread-favorite-pin').count()))
        throw new Error('pinned favorite glyph missing')
      if (
        !(await page
          .getByText('Ship the accessibility review follow-up', { exact: true })
          .count())
      )
        throw new Error('autoTodo what missing')
      await assertNavigationWithoutInbox(page, '.tab-bar')
    },
  },
  {
    file: 'gtd-phone-archived.png',
    viewport: PHONE,
    route: GTD,
    ready: '.gtd-page .gtd-list',
    safeInsets: true,
    reducedMotion: 'no-preference',
    async act(page) {
      await page.getByRole('button', { name: /^Archived, / }).click()
      await page.getByText('Retired onboarding flow', { exact: true }).waitFor()
      if (await page.locator('section[aria-label="Favorites"]').count())
        throw new Error('archive view includes non-archived favorites')
      if (
        await page
          .locator('.gtd-page .tab-bar-list [aria-selected="true"]')
          .count()
      )
        throw new Error('archive view left a visible status tab selected')
    },
  },
  {
    file: 'gtd-phone-inbox-older.png',
    viewport: PHONE,
    route: GTD,
    ready: '.gtd-page .gtd-list',
    safeInsets: true,
    async act(page) {
      await page.getByRole('tab', { name: /^Inbox,/ }).click()
      const toggle = page.locator('.gtd-older-toggle')
      await toggle.waitFor()
      // A long Inbox once flex-shrank the scrollable row and lifted the
      // indicator into the labels.
      const rowHeights = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '.gtd-page .tab-bar-list, .gtd-page .tab-bar-list button',
          ),
        ].map((node) => node.getBoundingClientRect().height),
      )
      if (rowHeights[0] + 0.5 < Math.max(...rowHeights.slice(1)))
        throw new Error(`GTD tab row squashed: ${rowHeights.join('|')}`)
      if ((await toggle.locator('small').textContent()) !== '2')
        throw new Error('old inbox count')
      if (await page.getByText('Old idea from 10 days ago').count())
        throw new Error('old inbox rows not folded')
      await toggle.click()
      const oldest = page.getByText('Old idea from 30 days ago')
      await oldest.waitFor()
      await oldest.scrollIntoViewIfNeeded()
    },
  },
  {
    file: 'gtd-phone-swipe-reveal.png',
    viewport: PHONE,
    route: GTD,
    ready: '.gtd-page .gtd-swipe-row',
    safeInsets: true,
    hasTouch: true,
    reducedMotion: 'no-preference',
    async act(page) {
      const row = page
        .locator('.gtd-swipe-row .thread-row', { hasText: 'Release checklist' })
        .first()
      const box = await row.boundingBox()
      if (!box) throw new Error('swipe row missing')
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await touch(page, 'touchStart', x, y)
      for (let step = 1; step <= 8; step += 1) {
        await touch(page, 'touchMove', x + step * 14, y)
        await page.waitForTimeout(30)
      }
      const reveal = page.locator(
        '.gtd-swipe-row.armed.reveal-right .gtd-swipe-action',
      )
      await reveal.waitFor()
      if ((await reveal.locator('span').textContent()) !== 'In progress')
        throw new Error('right swipe did not reveal In progress')
      if (!(await reveal.locator('svg').count()))
        throw new Error('In progress reveal icon missing')
    },
    async afterCapture(page) {
      const row = page.locator('.gtd-swipe-row.armed .thread-row')
      const box = await row.boundingBox()
      await touch(page, 'touchEnd', box.x + box.width / 2, box.y + 30)
      await page.getByText('Moved to In progress', { exact: true }).waitFor()
      if (
        await page
          .locator('.gtd-swipe-row .thread-row', {
            hasText: 'Release checklist',
          })
          .count()
      )
        throw new Error('swiped row still listed under To-do')
    },
  },
  {
    file: 'gtd-phone-status-sheet.png',
    viewport: PHONE,
    route: GTD,
    ready: '.gtd-page .gtd-list .thread-row',
    safeInsets: true,
    hasTouch: true,
    async act(page) {
      await holdRow(page, 'Tablet layout and timeline')
      for (const label of ['Set status', 'Unfavorite', 'Unpin from top'])
        if (!(await page.getByRole('menuitem', { name: label }).count()))
          throw new Error(`missing menu item ${label}`)
      await page.getByRole('menuitem', { name: 'Set status' }).click()
      const sheet = page.locator('.bottom-sheet')
      await sheet.waitFor()
      const rows = await sheet.locator('.sheet-row').allTextContents()
      if (rows.length !== 5) throw new Error(`status rows: ${rows.length}`)
      if (
        (await sheet
          .locator('.sheet-row[aria-pressed="true"]')
          .textContent()) !== 'Inbox'
      )
        throw new Error('current status not checked')
    },
  },
  {
    file: 'threads-narrow-two-pane.png',
    viewport: NARROW_TWO_PANE,
    route: `${DESKTOP}/t-long`,
    ready: '.split-sidebar .threads-page',
    safeInsets: true,
    async act(page) {
      await assertNoHorizontalOverflow(page, '.split-sidebar-content')
      const geometry = await page.evaluate(() => {
        const sidebar = document.querySelector('.split-sidebar')
        const header = document.querySelector(
          '.split-sidebar .scoped-root-header',
        )
        const title = header?.querySelector('h1')
        const actions = header?.querySelector('.thread-header-actions')
        const strip = document.querySelector('.split-sidebar .desktop-strip')
        const dot = strip?.querySelector('.desktop-status-marker')
        const chevron = strip?.querySelector(':scope > svg')
        if (
          !sidebar ||
          !header ||
          !title ||
          !actions ||
          !strip ||
          !dot ||
          !chevron
        )
          throw new Error('narrow Threads geometry target missing')
        const s = sidebar.getBoundingClientRect()
        const h = header.getBoundingClientRect()
        const t = title.getBoundingClientRect()
        const a = actions.getBoundingClientRect()
        const d = dot.getBoundingClientRect()
        const c = chevron.getBoundingClientRect()
        return {
          sidebarWidth: s.width,
          headerOverflow: header.scrollWidth - header.clientWidth,
          titleActionsGap: a.left - t.right,
          actionsRight: h.right - a.right,
          dotVisible: d.left >= s.left && d.right <= s.right,
          chevronVisible: c.left >= s.left && c.right <= s.right,
        }
      })
      console.log(`narrow Threads geometry ${JSON.stringify(geometry)}`)
      if (
        Math.abs(geometry.sidebarWidth - 260) > 0.5 ||
        geometry.headerOverflow > 0.5 ||
        geometry.titleActionsGap < 0 ||
        geometry.actionsRight < 0 ||
        !geometry.dotVisible ||
        !geometry.chevronVisible
      )
        throw new Error(`narrow Threads clipped: ${JSON.stringify(geometry)}`)
    },
  },
  {
    file: 'gtd-narrow-two-pane.png',
    viewport: NARROW_TWO_PANE,
    route: `${GTD}/t-taskCards-complete`,
    ready: '.split-sidebar .gtd-page',
    safeInsets: true,
    async act(page) {
      const tabs = page.locator('.split-sidebar .gtd-page .tab-bar-list')
      if (!(await tabs.evaluate((node) => node.classList.contains('compact'))))
        throw new Error('narrow GTD tabs did not enter compact mode')
      if (await tabs.locator('.tab-bar-label').count())
        throw new Error('narrow GTD tabs still show names')
      await assertNoHorizontalOverflow(page, '.split-sidebar-content')
      await assertTabIndicatorGeometry(
        page,
        '.split-sidebar .gtd-page .tab-bar-list',
      )
    },
  },
  {
    file: 'gtd-two-pane.png',
    viewport: TAB_TWO_PANE,
    route: `${GTD}/t-taskCards-complete`,
    ready: '.split-main .detail-header',
    safeInsets: true,
    async act(page) {
      await page.locator('.split-sidebar .gtd-page').waitFor()
      const tabs = page.locator('.split-sidebar .gtd-page .tab-bar-list')
      if (!(await tabs.evaluate((node) => node.classList.contains('compact'))))
        throw new Error('split GTD tabs did not enter compact mode')
      await assertNoHorizontalOverflow(
        page,
        '.split-sidebar .gtd-page .tab-bar-list',
      )
      await assertTabIndicatorGeometry(
        page,
        '.split-sidebar .gtd-page .tab-bar-list',
      )
      if (await page.locator('.split-sidebar .threads-page').count())
        throw new Error('Threads list shown beside a GTD conversation')
      if (!(await page.locator('.split-sidebar .thread-row.selected').count()))
        throw new Error('GTD row not selected')
      await assertNavigationWithoutInbox(page, '.split-nav')
    },
  },
  {
    file: 'threads-library-menu-open.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-list',
    safeInsets: true,
    async act(page) {
      await page.getByRole('button', { name: 'Library' }).click()
      const menu = page.getByRole('menu', { name: 'Library' })
      await menu.waitFor()
      const labels = await menu.getByRole('menuitem').allTextContents()
      if (labels.join('|') !== 'Crystals|Time clues|References')
        throw new Error(`Library menu items: ${labels.join('|')}`)
      if (!(await page.locator('.library-unread-dot').count()))
        throw new Error('Library unread dot missing')
      if (!(await menu.locator('.library-menu-unread-dot').count()))
        throw new Error('Time clues menu unread dot missing')
    },
  },
  {
    file: 'threads-crystals-top-right.png',
    viewport: PHONE,
    route: DESKTOP,
    ready: '.thread-list',
    safeInsets: true,
    async act(page) {
      threadsRootGeometry = await rootHeaderGeometry(page)
      console.log(
        `Threads root geometry ${JSON.stringify(threadsRootGeometry)}`,
      )
      await assertTabIndicatorGeometry(page, '.threads-page .tab-bar-list')
      const labels = await page
        .locator('.thread-header-actions button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('aria-label')),
        )
      if (labels.join('|') !== 'Library|GTD|Search|New thread')
        throw new Error(`header actions: ${labels.join('|')}`)
      const tabs = await page
        .locator('.threads-page [role="tab"]')
        .allTextContents()
      if (tabs.join('|') !== 'Threads|Projects')
        throw new Error(`Threads tabs: ${tabs.join('|')}`)
    },
  },
]

const shareShots = [
  {
    file: 'share-cover-text-link.png',
    viewport: { width: 360, height: 748 },
    route: '/share',
    query: 'shareKind=text',
    ready: '.share-screen',
    safeInsets: true,
    reducedMotion: 'no-preference',
    afterCapture: assertShareGeometry,
  },
  {
    file: 'share-inner-text-link.png',
    viewport: { width: 884, height: 1104 },
    route: '/share',
    query: 'shareKind=text',
    ready: '.share-screen',
    safeInsets: true,
    reducedMotion: 'no-preference',
    afterCapture: assertShareGeometry,
  },
  {
    file: 'share-cover-image.png',
    viewport: { width: 360, height: 748 },
    route: '/share',
    query: 'shareKind=image',
    ready: '.share-preview-images img',
    safeInsets: true,
    reducedMotion: 'no-preference',
    afterCapture: assertShareGeometry,
  },
  {
    file: 'share-inner-image.png',
    viewport: { width: 884, height: 1104 },
    route: '/share',
    query: 'shareKind=image',
    ready: '.share-preview-images img',
    safeInsets: true,
    reducedMotion: 'no-preference',
    afterCapture: assertShareGeometry,
  },
  {
    file: 'share-cover-offline-desktop.png',
    viewport: { width: 360, height: 748 },
    route: '/share',
    query: 'shareKind=text&shareOffline=1',
    ready: '.share-thread-row:disabled',
    safeInsets: true,
    reducedMotion: 'no-preference',
    afterCapture: assertShareGeometry,
  },
]

async function assertShareGeometry(page) {
  await assertNoHorizontalOverflow(page, '.share-screen')
  const geometry = await page.evaluate(() => {
    const screen = document.querySelector('.share-screen')
    const header = document.querySelector('.share-header')
    if (!(screen instanceof HTMLElement) || !(header instanceof HTMLElement))
      throw new Error('share geometry target missing')
    return {
      screen: screen.getBoundingClientRect().toJSON(),
      header: header.getBoundingClientRect().toJSON(),
      viewportWidth: innerWidth,
      safeTop: Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--safe-top',
        ),
      ),
    }
  })
  if (geometry.header.top < geometry.safeTop - 0.5)
    throw new Error(`share header above safe top: ${JSON.stringify(geometry)}`)
  if (
    geometry.screen.right > geometry.viewportWidth + 0.5 ||
    geometry.screen.left < -0.5
  )
    throw new Error(
      `share screen outside viewport: ${JSON.stringify(geometry)}`,
    )
}

const server = await createServer({
  mode: 'screenshots',
  logLevel: 'error',
  appType: 'spa',
  server: { host: '127.0.0.1', port: 5199 },
})
await server.listen()
const { port } = server.httpServer.address() // next free port if taken
let browser
const fixtureUrl = (route, fixture, query, language) =>
  `http://127.0.0.1:${port}/scripts/screenshots/fixture.html?route=${encodeURIComponent(route)}${fixture ? `&fixture=${fixture}` : ''}${query ? `&${query}` : ''}${language ? `&lang=${language}` : ''}`
try {
  const installedChrome =
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? installedChrome,
  })
  await mkdir(outDir, { recursive: true })
  // Vite optimizes dependencies on first load and then reloads the page;
  // absorb that once before any capture.
  const warmup = await browser.newPage()
  await warmup.goto(fixtureUrl(`${DESKTOP}/t-gen`))
  await warmup.waitForLoadState('networkidle')
  await warmup.locator('.thread-generating').waitFor({ timeout: 30_000 })
  await warmup.close()
  for (const shot of [
    ...taskCardsShots,
    ...screenShots,
    ...shots,
    ...herdrShots,
    ...gtdShots,
    ...shareShots,
  ].filter((item) => !only || only.test(item.file))) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: shot.deviceScaleFactor ?? 1,
      colorScheme: shot.colorScheme ?? 'dark',
      reducedMotion: shot.reducedMotion ?? 'reduce',
      hasTouch: shot.hasTouch ?? false,
      isMobile: shot.hasTouch ?? false,
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(
      fixtureUrl(shot.route, shot.fixture, shot.query, shot.language),
    )
    if (themeOverride && themeMode)
      await setFixtureTheme(page, themeOverride, themeMode)
    if (shot.safeInsets) {
      await page.waitForFunction(() => Boolean(window.__almaSetNativeInsets))
      await page.evaluate(
        ({ insets }) =>
          window.__almaSetNativeInsets?.(insets, {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }),
        { insets: simulatedNativeInsets },
      )
    }
    await page.locator(shot.ready).first().waitFor({ timeout: 15_000 })
    if (shot.act) await shot.act(page)
    // Let virtualized rows measure and the realtime fixture events land.
    await page.waitForTimeout(600)
    const path = join(outDir, shot.file)
    if (errors.length) throw new Error(`${shot.file}: ${errors.join('; ')}`)
    const renderedText = await page.locator('body').innerText()
    if (renderedText.includes('·'))
      throw new Error(`${shot.file}: rendered middot separator`)
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw new Error(`${shot.file}: horizontal overflow`)
    await page.screenshot({ path })
    if (shot.afterCapture) await shot.afterCapture(page)
    console.log(path)
    await context.close()
  }
} finally {
  await browser?.close()
  await server.close()
}
