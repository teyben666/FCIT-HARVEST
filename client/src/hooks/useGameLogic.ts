import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

export const FarmState = {
  EMPTY: 'empty',
  GROWING: 'growing',
  READY: 'ready',
  HARVESTED: 'harvested',
} as const

export type FarmState = (typeof FarmState)[keyof typeof FarmState]

export type CropKey = 'wheat' | 'corn' | 'gold'
type CropAlias = CropKey | 'carrot' | 'sunflower'

export const CROPS: Record<
  CropKey,
  { emoji: string; name: string; growTime: number; cost: number; sellPrice: number }
> = {
  wheat: { emoji: '🥕', name: 'Carrot', growTime: 3, cost: 0, sellPrice: 10 },
  corn: { emoji: '🌽', name: 'Corn', growTime: 5, cost: 50, sellPrice: 80 },
  gold: { emoji: '🌻', name: 'Sunflower', growTime: 8, cost: 150, sellPrice: 300 },
}

const CROP_ALIASES: Record<CropAlias, CropKey> = {
  wheat: 'wheat',
  carrot: 'wheat',
  corn: 'corn',
  gold: 'gold',
  sunflower: 'gold',
}

function normalizeCropKey(cropRaw: string): CropKey | null {
  const key = cropRaw.trim().toLowerCase() as CropAlias
  return CROP_ALIASES[key] ?? null
}

export type LogType = 'output' | 'success' | 'error' | 'input'

export interface LogEntry {
  id: number
  text: string
  type: LogType
}

interface GameRef {
  money: number
  farmState: FarmState
  currentCrop: CropKey | ''
  cropPrice: number
  timeLeft: number
}

const INITIAL: GameRef = {
  money: 30,
  farmState: FarmState.EMPTY,
  currentCrop: '',
  cropPrice: 0,
  timeLeft: 0,
}

function useTick() {
  return useReducer((n: number) => n + 1, 0)[1]
}

export function useGameLogic() {
  const tick = useTick()
  const game = useRef<GameRef>({ ...INITIAL })
  const growTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])

  const addLog = useCallback((text: string, type: LogType = 'output') => {
    const entry: LogEntry = { id: Date.now() + Math.random(), text, type }
    setLogs((prev) => [...prev, entry])
  }, [])

  const clearGrowTimer = useCallback(() => {
    if (growTimerRef.current) {
      clearInterval(growTimerRef.current)
      growTimerRef.current = null
    }
  }, [])

  const flush = useCallback(() => {
    tick()
  }, [tick])

  const plant = useCallback(
    (cropRaw: string) => {
      const g = game.current
      if (g.farmState !== FarmState.EMPTY) {
        addLog('❌ Field is not empty.', 'error')
        return
      }
      const crop = normalizeCropKey(cropRaw)
      if (!crop) {
        addLog('❌ Unknown crop. Use: carrot, corn, sunflower', 'error')
        return
      }
      const spec = CROPS[crop]
      if (g.money < spec.cost) {
        addLog(`❌ Not enough coins. Need ${spec.cost}, have ${g.money}.`, 'error')
        return
      }
      g.money -= spec.cost
      g.farmState = FarmState.GROWING
      g.currentCrop = crop
      g.cropPrice = spec.sellPrice
      g.timeLeft = spec.growTime
      clearGrowTimer()
      growTimerRef.current = setInterval(() => {
        g.timeLeft -= 1
        if (g.timeLeft > 0) {
          flush()
          return
        }
        clearGrowTimer()
        g.farmState = FarmState.READY
        addLog(`✅ ${spec.name} is ready to harvest!`, 'success')
        flush()
      }, 1000)
      addLog(`✅ Planted ${spec.name}. Matures in ${spec.growTime}s.`, 'success')
      flush()
    },
    [addLog, clearGrowTimer, flush],
  )

  const harvest = useCallback(() => {
    const g = game.current
    if (g.farmState !== FarmState.READY) {
      addLog(`❌ Nothing to harvest. State: ${g.farmState}`, 'error')
      return
    }
    clearGrowTimer()
    g.timeLeft = 0
    g.farmState = FarmState.HARVESTED
    addLog('✅ Harvested! You can sell now.', 'success')
    flush()
  }, [addLog, clearGrowTimer, flush])

  const sell = useCallback(() => {
    const g = game.current
    if (g.farmState !== FarmState.HARVESTED) {
      addLog(`❌ Harvest first. State: ${g.farmState}`, 'error')
      return
    }
    const price = g.cropPrice
    g.money += price
    g.farmState = FarmState.EMPTY
    g.currentCrop = ''
    g.cropPrice = 0
    addLog(`✅ Sold for ${price} coins.`, 'success')
    flush()
  }, [addLog, flush])

  const checkMoney = useCallback(() => {
    const m = game.current.money
    addLog(`💰 Coins: ${m}`, 'output')
    return m
  }, [addLog])

  const checkState = useCallback(() => {
    const g = game.current
    addLog(`🌾 Field: ${g.farmState}`, 'output')
    addLog(`🌱 Crop: ${g.currentCrop || 'none'}`, 'output')
    return g.farmState
  }, [addLog])

  const canAfford = useCallback((cropRaw: string) => {
    const crop = normalizeCropKey(cropRaw)
    if (!crop) return false
    const spec = CROPS[crop]
    if (!spec) return false
    return game.current.money >= spec.cost
  }, [])

  const wait = useCallback(
    (seconds: number) => {
      let s = seconds
      if (s <= 0) return Promise.resolve()
      if (s > 30) {
        addLog('⚠️ wait() capped at 30s.', 'error')
        s = 30
      }
      return new Promise<void>((resolve) => {
        setTimeout(resolve, s * 1000)
      })
    },
    [addLog],
  )

  const waitForReady = useCallback(() => {
    const g = game.current
    if (g.farmState === FarmState.READY) return true
    if (g.farmState === FarmState.EMPTY) return false
    if (g.farmState === FarmState.GROWING) {
      addLog('⏳ Crop still growing…', 'output')
      return false
    }
    return false
  }, [addLog])

  const plantAndSell = useCallback(
    (cropRaw: string) => {
      const g = game.current
      if (g.farmState !== FarmState.EMPTY) {
        addLog('⚠️ Field not empty.', 'error')
        return false
      }
      if (!canAfford(cropRaw)) {
        addLog(`⚠️ Cannot afford ${cropRaw}.`, 'error')
        return false
      }
      plant(cropRaw)
      return true
    },
    [addLog, canAfford, plant],
  )

  const harvestAndSell = useCallback(() => {
    const g = game.current
    if (g.farmState === FarmState.READY) {
      harvest()
      sell()
      return true
    }
    if (g.farmState === FarmState.HARVESTED) {
      sell()
      return true
    }
    return false
  }, [harvest, sell])

  const resetGame = useCallback(() => {
    clearGrowTimer()
    game.current = { ...INITIAL }
    flush()
  }, [clearGrowTimer, flush])

  useEffect(() => () => clearGrowTimer(), [clearGrowTimer])

  const runUserCode = useCallback(
    async (code: string, challengeMode: boolean) => {
      const codeStartTime = Date.now()
      const maxExecutionTime = 30_000
      let loopIterationCount = 0
      const maxLoopIterations = challengeMode ? 10_000 : 1000

      const checkLoopLimit = () => {
        loopIterationCount += 1
        if (loopIterationCount > maxLoopIterations) {
          throw new Error(`Too many loop iterations (${maxLoopIterations} max).`)
        }
        if (Date.now() - codeStartTime > maxExecutionTime) {
          throw new Error('Execution timed out (30s max).')
        }
      }

      const moneyDesc: PropertyDescriptor = {
        configurable: true,
        enumerable: true,
        get: () => game.current.money,
      }
      const stateDesc: PropertyDescriptor = {
        configurable: true,
        enumerable: true,
        get: () => game.current.farmState,
      }

      const tryRun = async () => {
        const useAsync = code.includes('await') || code.includes('async')
        if (useAsync) {
          const fn = new Function(
            'plant',
            'harvest',
            'sell',
            'wait',
            'checkMoney',
            'checkState',
            'checkLoopLimit',
            'canAfford',
            'plantAndSell',
            'harvestAndSell',
            'waitForReady',
            `return (async function () {\n${code}\n})();`,
          )
          return fn(
            plant,
            harvest,
            sell,
            wait,
            checkMoney,
            checkState,
            checkLoopLimit,
            canAfford,
            plantAndSell,
            harvestAndSell,
            waitForReady,
          )
        }
        const fn = new Function(
          'plant',
          'harvest',
          'sell',
          'wait',
          'checkMoney',
          'checkState',
          'checkLoopLimit',
          'canAfford',
          'plantAndSell',
          'harvestAndSell',
          'waitForReady',
          `${code}`,
        )
        return fn(
          plant,
          harvest,
          sell,
          wait,
          checkMoney,
          checkState,
          checkLoopLimit,
          canAfford,
          plantAndSell,
          harvestAndSell,
          waitForReady,
        )
      }

      try {
        Object.defineProperty(globalThis, 'money', moneyDesc)
        Object.defineProperty(globalThis, 'state', stateDesc)
        const result = await tryRun()
        const ms = Date.now() - codeStartTime
        if (result !== undefined) {
          addLog(`← Result: ${String(result)}`, 'output')
        } else {
          addLog(`✓ Done (${(ms / 1000).toFixed(2)}s)`, 'success')
        }
      } catch (err) {
        addLog(`❌ ${err instanceof Error ? err.message : String(err)}`, 'error')
      } finally {
        Reflect.deleteProperty(globalThis, 'money')
        Reflect.deleteProperty(globalThis, 'state')
      }
    },
    [
      addLog,
      plant,
      harvest,
      sell,
      wait,
      checkMoney,
      checkState,
      canAfford,
      plantAndSell,
      harvestAndSell,
      waitForReady,
    ],
  )

  const peekMoney = useCallback(() => game.current.money, [])

  /** Deduct coins for paid features (e.g. advisor in challenge). Returns false if insufficient. */
  const chargeCoins = useCallback(
    (amount: number) => {
      if (amount <= 0) return true
      const g = game.current
      if (g.money < amount) return false
      g.money -= amount
      flush()
      return true
    },
    [flush],
  )

  const g = game.current
  return {
    money: g.money,
    farmState: g.farmState,
    currentCrop: g.currentCrop,
    timeLeft: g.timeLeft,
    logs,
    addLog,
    plant,
    harvest,
    sell,
    resetGame,
    setLogs,
    runUserCode,
    peekMoney,
    chargeCoins,
  }
}

