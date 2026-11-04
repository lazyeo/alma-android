import { AlmaHttpError, type AlmaApi } from '../relay'
import {
  COMPOSER_DEFAULT_EFFORT,
  composerDefaultModel,
} from '../screens/newConversation'
import { normalizeEffortForModel } from '../screens/modelOptions'

/** The desktop has no way to create her main conversation; the phone does. */
export type PersonalSetupApi = Pick<
  AlmaApi,
  | 'getPersonal'
  | 'getThread'
  | 'createThread'
  | 'setPersonalMain'
  | 'listModels'
  | 'getSettings'
>

export type PersonalSetupStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>

export type PersonalSetupResult =
  | { status: 'ready'; threadId: string }
  /** The desktop predates `/api/personal`: nothing to set up. */
  | { status: 'unsupported' }

/** The title the official app gives her main conversation. */
export const PERSONAL_THREAD_TITLE = 'Alma'

export const personalThreadKey = (desktopId: string) =>
  `personal.thread.${desktopId}`

function browserStorage(): PersonalSetupStorage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

const read = (storage: PersonalSetupStorage | undefined, key: string) => {
  try {
    return storage?.getItem(key) || null
  } catch {
    return null
  }
}
const write = (
  storage: PersonalSetupStorage | undefined,
  key: string,
  value: string | null,
) => {
  try {
    if (value) storage?.setItem(key, value)
    else storage?.removeItem(key)
  } catch {
    // A full or blocked store only costs the cache.
  }
}

async function threadExists(api: PersonalSetupApi, id: string) {
  try {
    await api.getThread(id)
    return true
  } catch (error) {
    if (error instanceof AlmaHttpError && error.status === 404) return false
    throw error
  }
}

async function createPersonalThread(api: PersonalSetupApi) {
  const [models, settings] = await Promise.all([
    api.listModels(),
    api.getSettings(),
  ])
  const model = composerDefaultModel(models, settings)
  const reasoningEffort = normalizeEffortForModel(
    models.find((item) => item.id === model),
    COMPOSER_DEFAULT_EFFORT,
  )
  const thread = await api.createThread(PERSONAL_THREAD_TITLE, undefined, {
    ...(model ? { model } : {}),
    reasoningEffort,
  })
  return thread.id
}

/**
 * Finds or creates the personal agent's main conversation and makes the
 * desktop point at it, as the official app does when Alma opens:
 *
 * - a main thread the desktop already has and still reaches wins, and is
 *   cached;
 * - else the cached `personal.thread.<desktopId>` if it still exists (a 404
 *   clears it);
 * - else a new "Alma" thread with the composer's default model and effort.
 *
 * The local pick is then sent with `PUT /api/personal/main`. No message is
 * sent and no settings change. Throws on any failure (503 "not ready", a
 * dropped tunnel, a failed create) so the caller can offer a retry.
 */
export async function resolvePersonalThread(
  api: PersonalSetupApi,
  desktopId: string,
  storage: PersonalSetupStorage | undefined = browserStorage(),
): Promise<PersonalSetupResult> {
  const key = personalThreadKey(desktopId)
  const personal = await api.getPersonal()
  if (personal.status === 'unsupported') return { status: 'unsupported' }
  const desktopThread = personal.personal.threadId
  if (desktopThread && (await threadExists(api, desktopThread))) {
    write(storage, key, desktopThread)
    return { status: 'ready', threadId: desktopThread }
  }
  let threadId = read(storage, key)
  if (threadId && !(await threadExists(api, threadId))) {
    write(storage, key, null)
    threadId = null
  }
  threadId ??= await createPersonalThread(api)
  write(storage, key, threadId)
  await api.setPersonalMain(threadId)
  return { status: 'ready', threadId }
}

const inflight = new Map<string, Promise<PersonalSetupResult>>()

/**
 * One setup per desktop at a time: a second tap, a remount or StrictMode's
 * double effect joins the running one instead of creating another thread.
 */
export function ensurePersonalThread(
  api: PersonalSetupApi,
  desktopId: string,
  storage?: PersonalSetupStorage,
): Promise<PersonalSetupResult> {
  const running = inflight.get(desktopId)
  if (running) return running
  const next = resolvePersonalThread(api, desktopId, storage).finally(() =>
    inflight.delete(desktopId),
  )
  inflight.set(desktopId, next)
  return next
}
