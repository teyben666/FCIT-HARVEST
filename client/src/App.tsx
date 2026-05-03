import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Play,
  Trophy,
  BarChart3,
  Settings,
  ArrowLeft,
  Coins,
  Clock,
  Trash2,
  Eraser,
  RotateCcw,
  Zap,
  Sparkles,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import { useGameLogic, FarmState, CROPS, type CropKey } from './hooks/useGameLogic'
import { getApiBase, setApiBase, useLeaderboard } from './hooks/useLeaderboard'
import {
  type Locale,
  getStoredLocale,
  setStoredLocale,
  getUIText,
  getCategoryLabel,
  challengeStartMessage,
  apiSavedMessage,
  challengeEndAlert,
  dateLocale,
} from './locale'

type View = 'home' | 'game' | 'leaderboard' | 'settings'
type CommandEntry = { cmd: string; insertAs?: string; cost?: string }
type CommandCategory = { id: string; entries: CommandEntry[] }

const CHALLENGE_GOAL = 2000
const CHALLENGE_SECONDS = 120
/** Challenge mode only: advisor costs this percent of current coins (min 1). Practice mode is free. */
const ADVISOR_FEE_PERCENT = 10

function computeAdvisorFee(challengeMode: boolean, money: number): number {
  if (!challengeMode) return 0
  return Math.max(1, Math.floor((money * ADVISOR_FEE_PERCENT) / 100))
}
const COMMAND_CATEGORIES: CommandCategory[] = [
  {
    id: 'basic',
    entries: [
      { cmd: `plant('wheat')`, cost: '0' },
      { cmd: `plant('corn')`, cost: '50' },
      { cmd: `plant('gold')`, cost: '150' },
      { cmd: 'harvest()' },
      { cmd: 'sell()' },
      { cmd: 'await wait(1)' },
    ],
  },
  {
    id: 'conditions',
    entries: [
      {
        cmd: 'if / else (money)',
        insertAs: `if (money >= 50) {\n    plant('corn')\n} else {\n    plant('wheat')\n}`,
      },
      {
        cmd: 'if / else if (state)',
        insertAs: `if (state === 'ready') {\n    harvest()\n} else if (state === 'harvested') {\n    sell()\n}`,
      },
    ],
  },
  {
    id: 'loops',
    entries: [
      {
        cmd: 'while loop (auto farm)',
        insertAs: `while (money < 500) {\n    checkLoopLimit()\n    if (state === 'empty') {\n        plant('corn')\n    } else if (state === 'ready') {\n        harvest()\n    } else if (state === 'harvested') {\n        sell()\n    }\n}`,
      },
      {
        cmd: 'for loop x5',
        insertAs: `for (let i = 0; i < 5; i++) {\n    plant('wheat')\n    await wait(3)\n    harvest()\n    sell()\n}`,
      },
    ],
  },
  {
    id: 'debug',
    entries: [{ cmd: 'checkMoney()' }, { cmd: 'checkState()' }],
  },
]
const COMMAND_SNIPPETS = Array.from(
  new Set(COMMAND_CATEGORIES.flatMap((cat) => cat.entries.map((entry) => entry.insertAs ?? entry.cmd))),
)
const INITIAL_CATEGORY_STATE = COMMAND_CATEGORIES.reduce<Record<string, boolean>>((acc, cat) => {
  acc[cat.id] = cat.id === 'basic'
  return acc
}, {})

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => getStoredLocale())
  const t = getUIText(locale)

  const [view, setView] = useState<View>('home')
  const [challengeMode, setChallengeMode] = useState(false)
  const [challengeTimeLeft, setChallengeTimeLeft] = useState(CHALLENGE_SECONDS)
  const [playerName, setPlayerName] = useState('')
  const [code, setCode] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [settingsUrl, setSettingsUrl] = useState(() => getApiBase())
  const [autocompleteItems, setAutocompleteItems] = useState<string[]>([])
  const [autocompleteIndex, setAutocompleteIndex] = useState(0)
  const [autocompleteOpen, setAutocompleteOpen] = useState(false)
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(INITIAL_CATEGORY_STATE)
  const [advisorPanelCollapsed, setAdvisorPanelCollapsed] = useState(false)
  const [advisorLoading, setAdvisorLoading] = useState(false)
  const [advisorReply, setAdvisorReply] = useState('')
  const [advisorErr, setAdvisorErr] = useState<string | null>(null)

  const {
    money,
    farmState,
    currentCrop,
    timeLeft,
    logs,
    addLog,
    resetGame,
    setLogs,
    runUserCode,
    peekMoney,
    chargeCoins,
  } = useGameLogic()

  const { entries, stats, error, refresh, submitScore } = useLeaderboard()
  const consoleRef = useRef<HTMLDivElement>(null)
  const codeInputRef = useRef<HTMLTextAreaElement>(null)
  const endingChallenge = useRef(false)
  const endChallengeFn = useRef<() => void>(() => {})

  useEffect(() => {
    setStoredLocale(locale)
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [logs])

  const finalizeChallenge = useCallback(async () => {
    if (endingChallenge.current) return
    endingChallenge.current = true
    setChallengeMode(false)
    const finalMoney = peekMoney()
    const completed = finalMoney >= CHALLENGE_GOAL
    try {
      await submitScore(playerName || 'Anonymous', finalMoney, CHALLENGE_GOAL, completed)
    } catch (e) {
      addLog(`❌ Could not submit score: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
    window.alert(challengeEndAlert(locale, finalMoney, CHALLENGE_GOAL, completed))
    endingChallenge.current = false
  }, [addLog, locale, peekMoney, playerName, submitScore])

  useEffect(() => {
    endChallengeFn.current = () => {
      void finalizeChallenge()
    }
  }, [finalizeChallenge])

  useEffect(() => {
    if (!challengeMode) return
    const id = window.setInterval(() => {
      setChallengeTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(id)
          endChallengeFn.current()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [challengeMode])

  useEffect(() => {
    if (!challengeMode) return
    if (money >= CHALLENGE_GOAL) {
      endChallengeFn.current()
    }
  }, [challengeMode, money])

  const startChallenge = () => {
    const name = window.prompt(t.challengePrompt) || 'Anonymous'
    setPlayerName(name.trim().slice(0, 50) || 'Anonymous')
    resetGame()
    setLogs([])
    setChallengeMode(true)
    setChallengeTimeLeft(CHALLENGE_SECONDS)
    setView('game')
    addLog(challengeStartMessage(locale, CHALLENGE_GOAL, CHALLENGE_SECONDS), 'success')
  }

  const goPractice = () => {
    if (challengeMode) setChallengeMode(false)
    setView('game')
  }

  const executeCode = useCallback(async () => {
    if (isExecuting) return
    const trimmed = code.trim()
    if (!trimmed) return
    setIsExecuting(true)
    trimmed.split('\n').forEach((line) => {
      if (line.trim()) addLog(`  ${line}`, 'input')
    })
    addLog(t.runningLog, 'input')
    try {
      await runUserCode(trimmed, challengeMode)
    } finally {
      setIsExecuting(false)
    }
  }, [isExecuting, code, challengeMode, runUserCode, addLog, t.runningLog])

  const clearOutputLog = useCallback(() => setLogs([]), [])
  const clearCodeEditor = useCallback(() => setCode(''), [])

  const hideAutocomplete = useCallback(() => {
    setAutocompleteOpen(false)
    setAutocompleteItems([])
    setAutocompleteIndex(0)
  }, [])

  const getAutocompleteContext = useCallback((value: string, caret: number) => {
    const before = value.slice(0, caret)
    const tokenMatch = before.match(/([A-Za-z_$][\w$]*(?:\(['"]?[\w$]*)?)$/)
    if (!tokenMatch) return null
    const token = tokenMatch[1]
    const tokenStart = caret - token.length
    const matches = COMMAND_SNIPPETS.filter((item) => item.toLowerCase().startsWith(token.toLowerCase()))
    if (!matches.length) return null
    return { token, tokenStart, matches }
  }, [])

  const updateAutocomplete = useCallback(
    (value: string, caret: number) => {
      const ctx = getAutocompleteContext(value, caret)
      if (!ctx) {
        hideAutocomplete()
        return
      }
      setAutocompleteItems(ctx.matches)
      setAutocompleteIndex(0)
      setAutocompleteOpen(true)
    },
    [getAutocompleteContext, hideAutocomplete],
  )

  const applyAutocomplete = useCallback(
    (targetSnippet?: string) => {
      const textarea = codeInputRef.current
      if (!textarea) return false
      const start = textarea.selectionStart ?? 0
      const end = textarea.selectionEnd ?? start
      const value = textarea.value
      const ctx = getAutocompleteContext(value, start)
      if (!ctx) return false
      const chosen = targetSnippet ?? autocompleteItems[autocompleteIndex] ?? ctx.matches[0]
      if (!chosen) return false
      const next = `${value.slice(0, ctx.tokenStart)}${chosen}${value.slice(end)}`
      setCode(next)
      hideAutocomplete()
      requestAnimationFrame(() => {
        textarea.focus()
        const caret = ctx.tokenStart + chosen.length
        textarea.setSelectionRange(caret, caret)
      })
      return true
    },
    [autocompleteIndex, autocompleteItems, getAutocompleteContext, hideAutocomplete],
  )

  const insertSnippetAtCursor = useCallback((snippet: string) => {
    const textarea = codeInputRef.current
    hideAutocomplete()
    if (!textarea) {
      setCode((prev) => (prev ? `${prev}\n${snippet}` : snippet))
      return
    }
    const start = textarea.selectionStart ?? 0
    const end = textarea.selectionEnd ?? start
    const current = textarea.value
    const next = `${current.slice(0, start)}${snippet}${current.slice(end)}`
    setCode(next)
    requestAnimationFrame(() => {
      textarea.focus()
      const caret = start + snippet.length
      textarea.setSelectionRange(caret, caret)
    })
  }, [hideAutocomplete])

  const onCodeInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        hideAutocomplete()
        return
      }

      if (autocompleteOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        setAutocompleteIndex((prev) => {
          const len = autocompleteItems.length || 1
          return e.key === 'ArrowDown' ? (prev + 1) % len : (prev - 1 + len) % len
        })
        return
      }

      if (autocompleteOpen && e.key === 'Enter') {
        e.preventDefault()
        applyAutocomplete()
        return
      }

      if (e.key !== 'Tab') return

      // Multi-line selection keeps native indentation flow.
      const textarea = e.currentTarget
      const start = textarea.selectionStart ?? 0
      const end = textarea.selectionEnd ?? start
      const value = textarea.value
      const selected = value.slice(start, end)
      if (selected.includes('\n')) return

      e.preventDefault()

      if (applyAutocomplete()) {
        return
      }

      const indent = '    '
      const next = `${value.slice(0, start)}${indent}${value.slice(end)}`
      setCode(next)
      requestAnimationFrame(() => {
        const caret = start + indent.length
        textarea.setSelectionRange(caret, caret)
      })
    },
    [applyAutocomplete, autocompleteItems.length, autocompleteOpen, hideAutocomplete],
  )

  const onResetGame = () => {
    if (!window.confirm(t.resetConfirm)) return
    if (challengeMode) setChallengeMode(false)
    resetGame()
    setLogs([])
  }

  const saveSettings = () => {
    setApiBase(settingsUrl)
    void refresh()
    setView('home')
    addLog(apiSavedMessage(locale, getApiBase()), 'success')
  }

  const apiPrefix = useCallback((path: string) => {
    const base = getApiBase().replace(/\/$/, '')
    return base ? `${base}${path}` : path
  }, [])

  const askAdvisor = useCallback(async () => {
    const fee = computeAdvisorFee(challengeMode, money)
    const strings = getUIText(locale)
    setAdvisorPanelCollapsed(false)
    setAdvisorLoading(true)
    setAdvisorErr(null)
    if (challengeMode && money < fee) {
      setAdvisorErr(strings.advisorNotEnoughCoins(fee))
      setAdvisorLoading(false)
      return
    }
    const logsTail = logs
      .slice(-45)
      .map((l) => l.text)
      .join('\n')
    try {
      const res = await fetch(apiPrefix('/api/advisor'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          logsTail,
          money,
          farmState,
          currentCrop: currentCrop || '',
          growingSecondsLeft: farmState === FarmState.GROWING ? timeLeft : null,
          challengeMode,
          challengeTimeLeft: challengeMode ? challengeTimeLeft : null,
          challengeGoal: challengeMode ? CHALLENGE_GOAL : null,
          locale,
        }),
      })
      const data = (await res.json()) as { reply?: string; error?: string }
      if (!res.ok) throw new Error(data.error || `Advisor failed (${res.status})`)
      const reply = data.reply?.trim() || ''
      setAdvisorErr(null)
      if (challengeMode && fee > 0) {
        const paid = chargeCoins(fee)
        if (paid) {
          addLog(strings.advisorFeeCharged(fee), 'success')
        } else {
          addLog(strings.advisorNotEnoughCoins(fee), 'error')
        }
      }
      setAdvisorReply(reply)
    } catch (e) {
      setAdvisorErr(e instanceof Error ? e.message : String(e))
    } finally {
      setAdvisorLoading(false)
    }
  }, [
    addLog,
    apiPrefix,
    challengeMode,
    challengeTimeLeft,
    chargeCoins,
    code,
    currentCrop,
    farmState,
    locale,
    logs,
    money,
    timeLeft,
  ])

  const cropKey = (currentCrop || 'wheat') as CropKey
  const cropVisual = currentCrop ? CROPS[cropKey] : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault()
        void executeCode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [executeCode])

  return (
    <div className="min-h-screen bg-bg-dark text-white p-4 relative overflow-hidden">
      <div className="mesh-gradient">
        <div className="mesh-1" />
        <div className="mesh-2" />
        <div className="mesh-3" />
      </div>

      <div className="relative z-10 w-full flex flex-col items-center">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-4xl flex flex-col items-center pt-20"
            >
              <motion.div
                className="w-20 h-20 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-3xl mb-8 flex items-center justify-center shadow-[0_0_30px_rgba(129,140,248,0.4)]"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 6, repeat: Infinity }}
              >
                <div className="text-4xl">🌾</div>
              </motion.div>

              <motion.h1
                className="text-7xl font-bold tracking-tight mb-2 text-center"
                animate={{ scale: [1, 1.01, 1] }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                Harvest{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-pink-500">
                  IT
                </span>
              </motion.h1>
              <p className="text-white/40 text-lg mb-8 text-center font-medium tracking-tight">{t.tagline}</p>

              <div className="flex justify-center gap-2 mb-12">
                <button
                  type="button"
                  onClick={() => setLocale('en')}
                  className={`px-5 py-2 rounded-full text-xs font-bold transition-colors ${
                    locale === 'en' ? 'bg-white text-black' : 'bg-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLocale('zh')}
                  className={`px-5 py-2 rounded-full text-xs font-bold transition-colors ${
                    locale === 'zh' ? 'bg-white text-black' : 'bg-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  中文
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                <MenuCard
                  icon={<Play className="w-10 h-10 text-indigo-400" />}
                  title={t.practiceTitle}
                  desc={t.practiceDesc}
                  onClick={goPractice}
                />
                <MenuCard
                  icon={<Trophy className="w-10 h-10 text-purple-400" />}
                  title={t.challengeTitle}
                  desc={t.challengeDesc}
                  onClick={startChallenge}
                />
                <MenuCard
                  icon={<BarChart3 className="w-10 h-10 text-pink-400" />}
                  title={t.leaderboardTitle}
                  desc={t.leaderboardDesc}
                  onClick={() => setView('leaderboard')}
                />
                <MenuCard
                  icon={<Settings className="w-10 h-10 text-gray-400" />}
                  title={t.settingsTitle}
                  desc={t.settingsDesc}
                  onClick={() => {
                    setSettingsUrl(getApiBase())
                    setView('settings')
                  }}
                />
              </div>
            </motion.div>
          )}

          {view === 'game' && (
            <motion.div
              key="game"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-[1440px]"
            >
              <div className="flex items-center justify-between mb-8">
                <button
                  type="button"
                  onClick={() => setView('home')}
                  className="flex items-center gap-3 text-white/50 hover:text-white transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                  </div>
                  <span className="font-medium">{t.dashboard}</span>
                </button>
                <div className="flex bg-white/5 backdrop-blur-md rounded-full border border-white/10 p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setLocale('en')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors ${
                      locale === 'en' ? 'bg-white text-black shadow-lg' : 'text-white/50 hover:text-white'
                    }`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocale('zh')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full transition-colors ${
                      locale === 'zh' ? 'bg-white text-black shadow-lg' : 'text-white/50 hover:text-white'
                    }`}
                  >
                    中文
                  </button>
                </div>
        </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 min-h-0 xl:h-[calc(100vh-10rem)] xl:grid-rows-[minmax(0,1fr)]">
                <div className="xl:col-span-3 flex flex-col gap-4 min-h-0 xl:h-full xl:min-h-0">
                  <div className="glass-panel p-5 sm:p-6 rounded-[2.5rem] relative overflow-hidden group flex flex-col shrink-0 max-h-[min(52vh,380px)] xl:max-h-none">
                    <div className="flex justify-between items-start mb-6 relative z-10">
        <div>
                        {challengeMode ? (
                          <span className="px-4 py-1.5 bg-pink-500/20 text-pink-300 text-[10px] font-black rounded-full border border-pink-500/30 uppercase tracking-widest shadow-[0_0_20px_rgba(236,72,153,0.2)]">
                            {t.activeChallenge}
                          </span>
                        ) : (
                          <span className="px-4 py-1.5 bg-indigo-500/20 text-indigo-300 text-[10px] font-black rounded-full border border-indigo-500/30 uppercase tracking-widest">
                            {t.practiceSession}
                          </span>
                        )}
                        <h3 className="text-3xl sm:text-4xl font-bold mt-3 sm:mt-4 tracking-tight">
                          {t.mainField}{' '}
                          <span className="text-white/40 font-light">{t.fieldSuffix}</span>
                        </h3>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-3 p-1.5 bg-white/5 rounded-full border border-white/10 pl-4">
                          <span className="text-xl font-mono font-bold text-yellow-500">{money}</span>
                          <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/20">
                            <Coins className="w-4 h-4 text-black" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="w-full h-[150px] sm:h-[170px] xl:h-[190px] shrink-0 mx-auto bg-white/5 rounded-[2rem] flex flex-col items-center justify-center p-3 sm:p-6 border border-white/10 relative overflow-hidden shadow-inner">
                      <div className="absolute inset-0 grid grid-cols-6 grid-rows-6 opacity-[0.03]">
                        {Array.from({ length: 36 }).map((_, i) => (
                          <div key={i} className="border border-white" />
                        ))}
                      </div>

                      <AnimatePresence mode="wait">
                        {farmState === FarmState.EMPTY && (
                          <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-center relative z-10"
                          >
                            <div className="text-6xl sm:text-7xl mb-4 sm:mb-6 opacity-10 grayscale">🌱</div>
                            <p className="text-white/20 font-bold tracking-widest uppercase text-xs">
                              {t.readySowing}
                            </p>
                          </motion.div>
                        )}

                        {farmState === FarmState.GROWING && cropVisual && (
                          <motion.div
                            key="growing"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-center relative z-10"
                          >
                            <motion.div
                              className="text-7xl sm:text-8xl xl:text-9xl mb-4 sm:mb-6 drop-shadow-[0_20px_50px_rgba(129,140,248,0.3)]"
                              animate={{ scale: [1, 1.05, 1], rotate: [0, 2, -2, 0] }}
                              transition={{ duration: 4, repeat: Infinity }}
                            >
                              {cropVisual.emoji}
                            </motion.div>
                            <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-2 rounded-full">
                              <Clock className="w-4 h-4 text-indigo-400 animate-pulse" />
                              <span className="text-sm font-mono font-bold text-indigo-300">
                                {t.maturing}: {timeLeft}S
                              </span>
                            </div>
                          </motion.div>
                        )}

                        {farmState === FarmState.READY && cropVisual && (
                          <motion.div
                            key="ready"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1.1, opacity: 1 }}
                            className="text-center relative z-10"
                          >
                            <div className="text-7xl sm:text-8xl xl:text-9xl mb-4 sm:mb-6 drop-shadow-[0_0_40px_rgba(129,140,248,0.6)]">
                              {cropVisual.emoji}
                            </div>
                            <div className="bg-white text-black px-8 py-2 rounded-full text-xs font-black shadow-2xl shadow-indigo-500/40 animate-bounce cursor-default tracking-widest">
                              {t.readyHarvest}
                            </div>
                          </motion.div>
                        )}

                        {farmState === FarmState.HARVESTED && cropVisual && (
                          <motion.div
                            key="harvested"
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="text-center relative z-10"
                          >
                            <div className="text-6xl sm:text-7xl xl:text-8xl mb-4 sm:mb-6 grayscale opacity-20 transform -rotate-12">
                              {cropVisual.emoji}
                            </div>
                            <div className="bg-yellow-500 text-black px-8 py-2 rounded-full text-xs font-black shadow-2xl shadow-yellow-500/40 tracking-widest">
                              {t.pendingSale}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {challengeMode && (
                      <div className="mt-4 sm:mt-6 space-y-3 shrink-0">
                        <div className="flex justify-between items-end text-xs font-bold tracking-tighter">
                          <span className="text-white/40 uppercase">{t.timeline}</span>
                          <span className="text-pink-400 font-mono">
                            {Math.floor(challengeTimeLeft / 60)}:
                            {(challengeTimeLeft % 60).toString().padStart(2, '0')} {t.remaining}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                          <motion.div
                            className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 shadow-[0_0_15px_rgba(129,140,248,0.5)]"
                            initial={{ width: '100%' }}
                            animate={{
                              width: `${(challengeTimeLeft / CHALLENGE_SECONDS) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    className={`glass-panel rounded-2xl border border-indigo-500/20 overflow-hidden flex flex-col min-h-0 bg-indigo-500/[0.04] shadow-[0_0_40px_rgba(99,102,241,0.08)] ${
                      advisorPanelCollapsed ? 'shrink-0' : 'flex-1'
                    }`}
                    id="advisor-panel"
                  >
                    <div className="bg-white/5 px-3 py-2.5 sm:px-4 border-b border-white/10 flex items-center justify-between gap-2 flex-wrap shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                        <h2
                          id="advisor-title"
                          className="text-sm font-bold tracking-tight text-white/90 truncate"
                        >
                          {t.advisorTitle}
                        </h2>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void askAdvisor()}
                          disabled={
                            advisorLoading ||
                            (challengeMode && money < computeAdvisorFee(challengeMode, money))
                          }
                          title={
                            challengeMode
                              ? t.advisorFeeBadge(computeAdvisorFee(challengeMode, money))
                              : undefined
                          }
                          className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-indigo-500/25 border border-indigo-500/35 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-indigo-100 hover:bg-indigo-500/35 transition-colors disabled:opacity-50"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          {t.askAdvisor}
                        </button>
                        <button
                          type="button"
                          onClick={() => void askAdvisor()}
                          disabled={
                            advisorLoading ||
                            (challengeMode && money < computeAdvisorFee(challengeMode, money))
                          }
                          className="px-2.5 sm:px-3 py-2 rounded-xl text-[10px] sm:text-[11px] font-bold bg-white/10 text-white/80 hover:bg-white/15 disabled:opacity-50"
                        >
                          {advisorLoading ? '…' : t.advisorRefresh}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdvisorPanelCollapsed((c) => !c)}
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-colors"
                          aria-expanded={!advisorPanelCollapsed}
                          aria-controls="advisor-panel-body"
                          title={
                            advisorPanelCollapsed ? t.advisorPanelExpandAria : t.advisorPanelCollapseAria
                          }
                        >
                          {advisorPanelCollapsed ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronUp className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    {!advisorPanelCollapsed && (
                      <div
                        id="advisor-panel-body"
                        className="px-4 py-3 flex-1 min-h-[12rem] overflow-y-auto text-sm leading-relaxed text-white/85 space-y-3"
                      >
                        {advisorErr && (
                          <p className="text-pink-400 whitespace-pre-wrap text-xs">{advisorErr}</p>
                        )}
                        {advisorLoading && (
                          <p className="text-indigo-300/90 text-xs animate-pulse border-b border-white/5 pb-2">
                            {t.advisorThinking}
                          </p>
                        )}
                        {advisorReply && (
                          <div
                            className={`whitespace-pre-wrap ${advisorLoading ? 'opacity-45 pointer-events-none' : ''}`}
                          >
                            {advisorReply}
                          </div>
                        )}
                        {!advisorLoading && !advisorErr && !advisorReply && (
                          <p className="text-white/35 text-xs">{t.advisorEmptyHint}</p>
                        )}
                      </div>
                    )}
                  </div>

                </div>

                <div className="xl:col-span-6 flex flex-col gap-4 min-h-0 xl:h-full xl:min-h-0">
                  <div className="glass-panel rounded-[2rem] overflow-hidden flex flex-col flex-1 min-h-[240px] max-h-[min(52vh,420px)] xl:max-h-none xl:min-h-[280px]">
                    <div className="bg-white/5 p-4 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-2.5 h-2.5 shrink-0 rounded-full bg-emerald-500/40" />
                        <span className="text-[11px] font-mono font-bold text-white/40 uppercase tracking-widest truncate">
                          {t.outputTerminal}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={clearOutputLog}
                          className="p-2.5 rounded-xl bg-white/5 hover:bg-red-500/15 text-white/35 hover:text-red-400 border border-white/10 transition-colors"
                          aria-label={t.clearOutputAria}
                          title={t.clearOutputAria}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div
                      className="flex-1 console-scroll overflow-y-auto p-6 font-mono text-[13px] leading-relaxed space-y-2"
                      ref={consoleRef}
                    >
                      {logs.map((log) => (
                        <div
                          key={log.id}
                          className={`flex gap-4 ${
                            log.type === 'error'
                              ? 'text-pink-400'
                              : log.type === 'success'
                                ? 'text-indigo-300'
                                : log.type === 'input'
                                  ? 'text-indigo-400 font-bold'
                                  : 'text-white/60'
                          }`}
                        >
                          <span className="text-[10px] opacity-20 select-none mt-1">
                            {new Date(log.id).toLocaleTimeString([], {
                              hour12: false,
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                          <span className="flex-1 whitespace-pre-wrap">{log.text}</span>
                        </div>
                      ))}
                      {logs.length === 0 && (
                        <div className="h-full flex items-center justify-center text-white/10 text-xs font-black uppercase tracking-widest">
                          {t.terminalIdle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 shrink-0">
                    <div className="glass-panel rounded-[2rem] overflow-hidden flex flex-col border-2 border-white/5 focus-within:border-indigo-500/30 transition-all shadow-inner">
                      <div className="bg-white/5 px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-2.5 h-2.5 shrink-0 rounded-full bg-indigo-500/50" />
                          <span className="text-[11px] font-mono font-bold text-white/40 uppercase tracking-widest truncate">
                            {t.scriptInput}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={clearCodeEditor}
                          disabled={!code}
                          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/35 hover:text-indigo-300 border border-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          aria-label={t.clearCodeAria}
                          title={t.clearCodeAria}
                        >
                          <Eraser className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="relative group">
                        <textarea
                          ref={codeInputRef}
                          value={code}
                          onChange={(e) => {
                            const next = e.target.value
                            setCode(next)
                            updateAutocomplete(next, e.target.selectionStart ?? next.length)
                          }}
                          onKeyDown={onCodeInputKeyDown}
                          onClick={(e) => {
                            const el = e.currentTarget
                            updateAutocomplete(el.value, el.selectionStart ?? 0)
                          }}
                          onKeyUp={(e) => {
                            const el = e.currentTarget
                            if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(e.key)) return
                            updateAutocomplete(el.value, el.selectionStart ?? 0)
                          }}
                          onBlur={() => {
                            window.setTimeout(() => hideAutocomplete(), 120)
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault()
                            const snippet = e.dataTransfer.getData('text/plain')
                            if (snippet) insertSnippetAtCursor(snippet)
                          }}
                          placeholder={t.codePlaceholder}
                          className="w-full h-40 bg-transparent p-6 font-mono text-sm text-white/80 outline-none resize-none"
                        />
                        {autocompleteOpen && autocompleteItems.length > 0 && (
                          <div className="absolute left-4 right-4 bottom-4 rounded-xl border border-white/10 bg-[#0d0d18]/95 backdrop-blur-md overflow-hidden z-20">
                            {autocompleteItems.slice(0, 6).map((item, idx) => (
                              <button
                                key={item}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  void applyAutocomplete(item)
                                }}
                                className={`w-full text-left px-4 py-2 font-mono text-xs transition-colors ${
                                  idx === autocompleteIndex
                                    ? 'bg-indigo-500/25 text-indigo-200'
                                    : 'text-white/70 hover:bg-white/5'
                                }`}
                              >
                                {item}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => void executeCode()}
                        disabled={isExecuting}
                        className="flex-1 h-16 bg-white text-black font-black text-xs uppercase tracking-widest rounded-[1.5rem] flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-indigo-500/20 disabled:opacity-50"
                      >
                        <Play className={`w-4 h-4 fill-current ${isExecuting ? 'animate-spin' : ''}`} />
                        {isExecuting ? t.executeProcessing : t.executeRun}
                      </button>
                      <button
                        type="button"
                        onClick={onResetGame}
                        className="w-16 h-16 glass-panel rounded-[1.5rem] flex items-center justify-center group hover:bg-white/10 transition-all border border-white/10"
                        aria-label={t.resetFarmAria}
                      >
                        <RotateCcw className="w-5 h-5 text-white/40 group-hover:text-white transition-colors" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="xl:col-span-3 flex flex-col min-h-0 xl:h-full xl:min-h-0">
                  <div className="glass-panel p-6 rounded-3xl min-h-[360px] h-[520px] xl:h-full xl:min-h-0 flex flex-col flex-1">
                    <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                      <Zap className="w-3 h-3" /> {t.commandRegistry}
                    </h3>
                    <div className="overflow-y-auto pr-1 flex-1 space-y-3">
                      {COMMAND_CATEGORIES.map((category) => {
                        const isOpen = openCategories[category.id] ?? false
                        return (
                          <div key={category.id} className="rounded-xl border border-white/10 bg-white/[0.02]">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenCategories((prev) => ({ ...prev, [category.id]: !isOpen }))
                              }
                              className="w-full flex items-center justify-between px-3 py-2 text-left"
                            >
                              <span className="text-[11px] font-bold text-white/70 uppercase tracking-wide">
                                {getCategoryLabel(category.id, locale)}
                              </span>
                              <span className="text-white/40 text-xs">{isOpen ? '−' : '+'}</span>
                            </button>
                            {isOpen && (
                              <div className="p-2 pt-0 grid grid-cols-1 gap-2">
                                {category.entries.map((entry) => (
                                  <CommandItem
                                    key={`${category.id}-${entry.cmd}`}
                                    cmd={entry.cmd}
                                    insertAs={entry.insertAs}
                                    cost={entry.cost}
                                    onInsert={insertSnippetAtCursor}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
        </div>
            </motion.div>
          )}

          {view === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-5xl"
            >
              <div className="flex items-center justify-between mb-16 px-4">
                <button
                  type="button"
                  onClick={() => setView('home')}
                  className="flex items-center gap-3 text-white/50 hover:text-white transition-colors group"
                >
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10">
                    <ArrowLeft className="w-4 h-4" />
                  </div>
                  <span className="font-semibold">{t.dashboard}</span>
                </button>
                <div className="text-center">
                  <h2 className="text-5xl font-bold tracking-tighter">
                    {t.leaderboardGlobal}{' '}
                    <span className="font-light text-white/40">{t.leaderboardHall}</span>
                  </h2>
                </div>
                <div className="w-20" />
              </div>

              {error && (
                <p className="text-center text-pink-400 text-sm mb-6">
                  {error} — {t.leaderboardError}
                </p>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                <StatBlock label={t.statTotal} value={stats?.total ?? 0} />
                <StatBlock
                  label={t.statVictory}
                  value={`${Math.round(((stats?.completed ?? 0) / (stats?.total || 1)) * 100)}%`}
                  color="text-indigo-400"
                />
                <StatBlock label={t.statAvg} value={stats?.avgScore ?? 0} />
                <StatBlock label={t.statHigh} value={stats?.maxScore ?? 0} color="text-pink-500" />
              </div>

              <div className="glass-panel p-8 rounded-[3rem]">
                <div className="grid grid-cols-12 gap-8 p-4 mb-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em] border-b border-white/5">
                  <div className="col-span-1">{t.rank}</div>
                  <div className="col-span-5">{t.name}</div>
                  <div className="col-span-2 text-center">{t.score}</div>
                  <div className="col-span-2 text-center">{t.status}</div>
                  <div className="col-span-2 text-right">{t.date}</div>
                </div>
                <div className="space-y-4">
                  {entries.map((entry, idx) => (
                    <motion.div
                      key={`${entry.name}-${entry.timestamp}-${idx}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.05, 0.5) }}
                      className="grid grid-cols-12 gap-8 p-6 glass-panel !bg-white/2 rounded-2xl items-center border border-white/5 hover:border-white/20 transition-all group"
                    >
                      <div className="col-span-1 font-mono text-xl opacity-20">
                        {(idx + 1).toString().padStart(2, '0')}
                      </div>
                      <div className="col-span-5">
                        <p className="font-bold text-lg group-hover:text-indigo-400 transition-colors uppercase tracking-tight">
                          {entry.name}
                        </p>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className="text-2xl font-mono font-bold text-yellow-500">{entry.score}</span>
                      </div>
                      <div className="col-span-2 text-center">
                        {entry.completed ? (
                          <span className="px-3 py-1 bg-indigo-500/10 text-indigo-300 text-[9px] font-black rounded-full border border-indigo-500/20">
                            {t.success}
                          </span>
                        ) : (
                          <span className="px-3 py-1 bg-pink-500/10 text-pink-300 text-[9px] font-black rounded-full border border-pink-500/20">
                            {t.failed}
                          </span>
                        )}
                      </div>
                      <div className="col-span-2 text-right text-[11px] font-medium text-white/30">
                        {new Date(entry.timestamp).toLocaleDateString(dateLocale(locale))}
                      </div>
                    </motion.div>
                  ))}
                  {entries.length === 0 && !error && (
                    <div className="py-32 text-center text-white/10 font-black uppercase tracking-[0.3em]">
                      {t.noRecords}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="w-full max-w-lg glass-panel rounded-[2rem] p-10"
            >
              <button
                type="button"
                onClick={() => setView('home')}
                className="flex items-center gap-3 text-white/50 hover:text-white mb-8"
              >
                <ArrowLeft className="w-4 h-4" />
                {t.back}
              </button>
              <div className="flex gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => setLocale('en')}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                    locale === 'en' ? 'bg-white text-black' : 'bg-white/10 text-white/60'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLocale('zh')}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                    locale === 'zh' ? 'bg-white text-black' : 'bg-white/10 text-white/60'
                  }`}
                >
                  中文
                </button>
              </div>
              <h2 className="text-3xl font-bold mb-2">{t.settingsApiTitle}</h2>
              <p className="text-white/40 text-sm mb-6">{t.settingsApiBody}</p>
              <p className="text-white/30 text-xs mb-6 leading-relaxed">{t.settingsAdvisorNote}</p>
              <input
                value={settingsUrl}
                onChange={(e) => setSettingsUrl(e.target.value)}
                placeholder="http://localhost:3000"
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 font-mono text-sm outline-none focus:border-indigo-500/40 mb-4"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={saveSettings}
                  className="flex-1 h-12 rounded-xl bg-white text-black font-bold text-sm"
                >
                  {t.save}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsUrl('')
                    setApiBase('')
                    void refresh()
                  }}
                  className="px-6 h-12 rounded-xl border border-white/10 text-white/70 text-sm"
                >
                  {t.useSameHost}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function MenuCard({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: ReactNode
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -8, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="glass-panel p-10 rounded-[2.5rem] text-left transition-all relative group overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-12 text-white/5 text-8xl font-black transition-all group-hover:scale-110 group-hover:opacity-10 opacity-0 md:opacity-[0.03]">
        ↗
      </div>
      <div className="mb-8">{icon}</div>
      <h3 className="text-2xl font-bold mb-3 tracking-tight">{title}</h3>
      <p className="text-white/40 text-[13px] leading-relaxed font-medium">{desc}</p>
    </motion.button>
  )
}

function CommandItem({
  cmd,
  cost,
  insertAs,
  onInsert,
}: {
  cmd: string
  cost?: string
  insertAs?: string
  onInsert: (cmd: string) => void
}) {
  const value = insertAs ?? cmd
  return (
    <button
      type="button"
      draggable
      onClick={() => onInsert(value)}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', value)}
      className="bg-white/5 p-3 rounded-xl border border-white/5 flex justify-between items-center group hover:bg-white/10 transition-colors text-left cursor-grab active:cursor-grabbing"
      title="Click or drag into editor"
    >
      <span className="text-[10px] font-mono font-bold text-indigo-300/80">{cmd}</span>
      {cost !== undefined && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-black text-yellow-600/60 tracking-tighter">-{cost}G</span>
        </div>
      )}
    </button>
  )
}

function StatBlock({
  label,
  value,
  color = 'text-white',
}: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="glass-panel p-8 rounded-3xl text-center">
      <div className={`text-4xl font-mono font-black mb-2 tracking-tighter ${color}`}>{value}</div>
      <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">{label}</div>
    </div>
  )
}
