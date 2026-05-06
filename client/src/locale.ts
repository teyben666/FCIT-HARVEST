export type Locale = 'en' | 'zh'

const STORAGE_KEY = 'harvestITLanguage'

export function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'zh' ? 'zh' : 'en'
}

export function setStoredLocale(locale: Locale): void {
  localStorage.setItem(STORAGE_KEY, locale)
}

export function dateLocale(locale: Locale): string {
  return locale === 'zh' ? 'zh-CN' : 'en-US'
}

const CATEGORY_IDS = ['basic', 'conditions', 'loops', 'debug'] as const

const categoryLabels: Record<Locale, Record<(typeof CATEGORY_IDS)[number], string>> = {
  en: {
    basic: 'Basic Actions',
    conditions: 'Conditions',
    loops: 'Loops',
    debug: 'Debug / Inspect',
  },
  zh: {
    basic: '基础操作',
    conditions: '条件判断',
    loops: '循环',
    debug: '调试 / 查看',
  },
}

export function getCategoryLabel(id: string, locale: Locale): string {
  const key = id as (typeof CATEGORY_IDS)[number]
  return categoryLabels[locale][key] ?? categoryLabels.en[key] ?? id
}

export type UIText = {
  tagline: string
  practiceTitle: string
  practiceDesc: string
  challengeTitle: string
  challengeDesc: string
  leaderboardTitle: string
  leaderboardDesc: string
  settingsTitle: string
  settingsDesc: string
  dashboard: string
  activeChallenge: string
  practiceSession: string
  mainField: string
  fieldSuffix: string
  readySowing: string
  maturing: string
  readyHarvest: string
  pendingSale: string
  timeline: string
  remaining: string
  outputTerminal: string
  scriptInput: string
  askAdvisor: string
  terminalIdle: string
  codePlaceholder: string
  executeRun: string
  executeProcessing: string
  resetFarmAria: string
  clearOutputAria: string
  clearCodeAria: string
  commandRegistry: string
  leaderboardGlobal: string
  leaderboardHall: string
  leaderboardError: string
  statTotal: string
  statVictory: string
  statAvg: string
  statHigh: string
  rank: string
  name: string
  score: string
  status: string
  date: string
  success: string
  failed: string
  noRecords: string
  settingsApiTitle: string
  settingsApiBody: string
  settingsAdvisorNote: string
  save: string
  useSameHost: string
  back: string
  advisorTitle: string
  advisorClose: string
  advisorPanelCollapseAria: string
  advisorPanelExpandAria: string
  advisorThinking: string
  advisorEmptyHint: string
  advisorRefresh: string
  advisorFeeCharged: (fee: number) => string
  advisorNotEnoughCoins: (need: number) => string
  advisorFeeBadge: (fee: number) => string
  challengePrompt: string
  resetConfirm: string
  runningLog: string
  globalBrand: string
}

const UI: Record<Locale, UIText> = {
  en: {
    tagline: 'Master the logic of farming through code.',
    practiceTitle: 'Practice Mode',
    practiceDesc: 'Learn commands and practice logic freely in a sandbox environment.',
    challengeTitle: 'Challenge Mode',
    challengeDesc: 'Race against time to earn 2000 coins and claim your rank.',
    leaderboardTitle: 'Leaderboard',
    leaderboardDesc: 'See how you rank against other elite digital farmers.',
    settingsTitle: 'Settings',
    settingsDesc: 'Server URL for scores (leave empty if API is on the same host).',
    dashboard: 'Dashboard',
    activeChallenge: 'Active Challenge',
    practiceSession: 'Practice Session',
    mainField: 'Main',
    fieldSuffix: 'Field',
    readySowing: 'Ready for sowing',
    maturing: 'MATURING',
    readyHarvest: 'READY FOR HARVEST',
    pendingSale: 'PENDING SALE',
    timeline: 'Timeline',
    remaining: 'remaining',
    outputTerminal: 'Output',
    scriptInput: 'Script input',
    askAdvisor: 'Ask advisor',
    terminalIdle: 'Terminal idle',
    codePlaceholder: "Write your farm script...\ne.g. plant('carrot')",
    executeRun: 'Execute sequence (F5)',
    executeProcessing: 'Processing…',
    resetFarmAria: 'Reset farm',
    clearOutputAria: 'Clear output log',
    clearCodeAria: 'Clear editor',
    commandRegistry: 'Command registry',
    leaderboardGlobal: 'Global',
    leaderboardHall: 'hall of fame',
    leaderboardError: 'check Settings → API URL or start the server.',
    statTotal: 'Total runs',
    statVictory: 'Victory rate',
    statAvg: 'Average score',
    statHigh: 'High score',
    rank: 'Rank',
    name: 'Name',
    score: 'Score',
    status: 'Status',
    date: 'Date',
    success: 'SUCCESS',
    failed: 'FAILED',
    noRecords: 'No records yet',
    settingsApiTitle: 'API server',
    settingsApiBody:
      'Leave empty when the game is served from the same host as the API (recommended). For another device, enter the full URL (e.g. http://192.168.1.10:3000).',
    settingsAdvisorNote:
      'Ask advisor needs Ollama on the machine running Node (ollama serve, pull a model). Override with env OLLAMA_URL and OLLAMA_MODEL on the server.',
    save: 'Save',
    useSameHost: 'Use same host',
    back: 'Back',
    advisorTitle: 'Advisor',
    advisorClose: 'Close',
    advisorPanelCollapseAria: 'Hide advisor reply',
    advisorPanelExpandAria: 'Show advisor reply',
    advisorThinking: 'Thinking about your farm session…',
    advisorEmptyHint:
      'Hints are text-only (no copy-paste code). The server needs Ollama: set OLLAMA_URL / OLLAMA_MODEL or run Ollama on the host.',
    advisorRefresh: 'Refresh',
    advisorFeeCharged: (fee: number) => `Advisor fee: −${fee} coins (10% in challenge).`,
    advisorNotEnoughCoins: (need: number) => `Not enough coins. Need at least ${need} for the advisor (10% fee, min 1).`,
    advisorFeeBadge: (fee: number) =>
      `Challenge: ${fee} coins (10% of balance, min 1). Practice mode is free.`,
    challengePrompt: 'Enter your name for the leaderboard:',
    resetConfirm: 'Reset the farm? Progress will be lost.',
    runningLog: '> Running…',
    globalBrand: 'Harvest IT',
  },
  zh: {
    tagline: '用代码掌握种田逻辑。',
    practiceTitle: '练习模式',
    practiceDesc: '在沙盒里自由练习指令与逻辑。',
    challengeTitle: '挑战模式',
    challengeDesc: '限时赚取 2000 金币并登上排行榜。',
    leaderboardTitle: '排行榜',
    leaderboardDesc: '看看你在数字农夫中的名次。',
    settingsTitle: '设置',
    settingsDesc: '成绩服务器地址（与游戏同域时可留空）。',
    dashboard: '首页',
    activeChallenge: '挑战进行中',
    practiceSession: '练习中',
    mainField: '主',
    fieldSuffix: '场地',
    readySowing: '等待播种',
    maturing: '生长中',
    readyHarvest: '可收割',
    pendingSale: '待出售',
    timeline: '时间线',
    remaining: '剩余',
    outputTerminal: '输出',
    scriptInput: '代码输入',
    askAdvisor: '问问导师',
    terminalIdle: '终端空闲',
    codePlaceholder: '在此编写农场脚本…\n例如 plant(\'carrot\')',
    executeRun: '执行 (F5)',
    executeProcessing: '执行中…',
    resetFarmAria: '重置农场',
    clearOutputAria: '清空输出',
    clearCodeAria: '清空编辑器',
    commandRegistry: '指令库',
    leaderboardGlobal: '全球',
    leaderboardHall: '名人堂',
    leaderboardError: '请检查设置里的 API 地址，或确认后端已启动。',
    statTotal: '总场次',
    statVictory: '达标率',
    statAvg: '平均分',
    statHigh: '最高分',
    rank: '排名',
    name: '名称',
    score: '分数',
    status: '状态',
    date: '日期',
    success: '成功',
    failed: '未达标',
    noRecords: '暂无记录',
    settingsApiTitle: 'API 服务器',
    settingsApiBody:
      '当游戏与 API 在同一域名下时请留空。在其他设备上访问时填写完整地址（如 http://192.168.1.10:3000）。',
    settingsAdvisorNote:
      '问问导师：需在运行 Node 的机器上安装 Ollama（ollama serve 并拉取模型）。可通过环境变量 OLLAMA_URL、OLLAMA_MODEL 覆盖。',
    save: '保存',
    useSameHost: '使用同源',
    back: '返回',
    advisorTitle: '导师',
    advisorClose: '关闭',
    advisorPanelCollapseAria: '收起导师回复',
    advisorPanelExpandAria: '展开导师回复',
    advisorThinking: '正在结合你的农场状态思考…',
    advisorEmptyHint:
      '提示仅为文字说明（不提供可复制代码）。服务器需运行 Ollama，并配置 OLLAMA_URL / OLLAMA_MODEL。',
    advisorRefresh: '刷新',
    advisorFeeCharged: (fee: number) => `导师费用：−${fee} 金币（挑战模式收取 10%）。`,
    advisorNotEnoughCoins: (need: number) => `金币不足：至少需要 ${need} 才能询问导师（挑战模式 10% 手续费，最少 1）。`,
    advisorFeeBadge: (fee: number) =>
      `挑战：${fee} 金币（当前余额的 10%，最少 1）。练习模式免费。`,
    challengePrompt: '请输入用于排行榜的名字：',
    resetConfirm: '确定重置农场？进度将清空。',
    runningLog: '> 运行中…',
    globalBrand: 'Harvest IT',
  },
}

export function getUIText(locale: Locale): UIText {
  return UI[locale]
}

export function challengeStartMessage(locale: Locale, goal: number, seconds: number): string {
  return locale === 'zh'
    ? `挑战开始！在 ${seconds} 秒内赚到 ${goal} 金币。`
    : `Challenge started! Reach ${goal} coins in ${seconds}s.`
}

export function apiSavedMessage(locale: Locale, url: string): string {
  return locale === 'zh' ? `API 地址：${url || '（同源 /api）'}` : `API base: ${url || '(same origin /api)'}`
}

export function challengeEndAlert(locale: Locale, final: number, goal: number, completed: boolean): string {
  if (locale === 'zh') {
    return `挑战结束！\n最终：${final} 金币\n目标：${goal}\n${completed ? '成功！' : '再试一次！'}`
  }
  return `Challenge ended!\nFinal: ${final} coins\nGoal: ${goal}\n${completed ? 'Success!' : 'Try again!'}`
}
