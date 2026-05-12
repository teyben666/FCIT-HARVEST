const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

const ADVISOR_SYSTEM_BASE = `You are a teaching assistant for "Harvest IT", a short workshop game where learners write small scripts.

STRICT RULES:
- Do NOT output runnable code. No markdown code fences (\`\`\`), no JavaScript/Python snippets, no plant(, harvest(, sell(, wait(, no full scripts or one-liners meant to paste.
- Use plain language only: bullet points or numbered steps (max 7 points).
- Name ideas in words only (e.g. "check if the field is ready before harvesting"), never paste API calls.

REPLY SHAPE (be precise; avoid filler):
- First line: one short sentence — the single most likely issue OR the first thing to verify (use the session snapshot: money, farm_state, logs).
- Then: 3–6 bullets, each concrete (which state, what to check, what usually goes wrong), not generic study tips.

Game facts (for your reasoning):
- Commands available in code: plant('carrot'|'corn'|'sunflower') and aliases plant('wheat'|'gold'), harvest(), sell(), await wait(seconds), checkMoney(), checkState(), checkLoopLimit(), canAfford(...).
- Field state is one of: empty, growing, ready, harvested.
- Carrot (alias wheat) cost 0, corn 50, sunflower (alias gold) 150 coins.

Your job: infer whether they have an error or are stuck without errors, then give the next checks and mindset tips—not code.`;

function advisorSystemForLocale(locale) {
    const lang =
        locale === 'zh'
            ? 'OUTPUT LANGUAGE: Reply in Simplified Chinese (简体中文) only, matching the student UI language. Do not use English for the main answer.'
            : 'OUTPUT LANGUAGE: The student UI is English. Reply in English ONLY. Do not use Chinese characters (no 中文). If you name a game term, use English. Any Chinese in your reply is a failure.';
    return `${ADVISOR_SYSTEM_BASE}\n\n${lang}`;
}

const EN_TRANSLATE_SYSTEM = `You convert teaching hints to clear English. Preserve structure: same bullets and numbering. No code, no markdown code blocks. Output only the translated text. If the input is already English, return it unchanged.`;

function cjkCharCount(s) {
    return (String(s).match(/[\u4e00-\u9fff]/g) || []).length;
}

function latinCharCount(s) {
    return (String(s).match(/[a-zA-Z]/g) || []).length;
}

/** Model sometimes ignores locale; if reply is mostly Chinese while UI is English, we rewrite once. */
function replyLooksChineseForEnUi(text) {
    const c = cjkCharCount(text);
    if (c < 6) return false;
    const l = latinCharCount(text);
    return c >= 12 || (l > 0 ? c / l >= 0.35 : true);
}

async function ollamaChat(messages, signal) {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages,
            stream: false,
            options: {
                temperature: 0.35,
                num_predict: 700,
            },
        }),
    });
    const raw = await ollamaRes.text();
    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        const err = new Error('Invalid response from Ollama');
        err.detail = raw.slice(0, 200);
        throw err;
    }
    if (!ollamaRes.ok) {
        const err = new Error(data.error || 'Ollama request failed');
        err.detail = typeof data === 'string' ? data : JSON.stringify(data).slice(0, 300);
        throw err;
    }
    const reply = (data.message && data.message.content && String(data.message.content).trim()) || '';
    if (!reply) {
        const err = new Error('Empty reply from model');
        throw err;
    }
    return reply;
}

// 中间件
app.use(cors());
app.use(express.json());

// 创建数据库
const db = new sqlite3.Database(path.join(__dirname, 'harvestit.db'));

// 创建表
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        score INTEGER NOT NULL,
        goal INTEGER NOT NULL,
        completed INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // 创建索引提高查询速度
    db.run('CREATE INDEX IF NOT EXISTS idx_score ON records(score DESC)');
});

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Harvest IT Server is running' });
});

// 提交成绩
app.post('/api/submit', (req, res) => {
    const { name, score, goal, completed } = req.body;
    
    // 验证数据
    if (typeof score !== 'number' || score < 0) {
        return res.status(400).json({ error: 'Invalid score' });
    }
    
    if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    db.run(
        'INSERT INTO records (name, score, goal, completed) VALUES (?, ?, ?, ?)',
        [name.trim().substring(0, 50), score, goal || 500, completed ? 1 : 0],
        function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Failed to save record' });
            }
            console.log(`✅ 新成绩: ${name} - ${score} 金币 (${completed ? '完成' : '未完成'})`);
            res.json({ 
                id: this.lastID, 
                message: '成绩已记录',
                rank: null
            });
        }
    );
});

// 获取排行榜
app.get('/api/leaderboard', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    
    db.all(
        'SELECT id, name, score, goal, completed, timestamp FROM records ORDER BY score DESC LIMIT ?',
        [limit],
        (err, rows) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Failed to fetch leaderboard' });
            }
            res.json(rows);
        }
    );
});

// 获取统计信息
app.get('/api/stats', (req, res) => {
    db.get(
        `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed,
            ROUND(AVG(score), 2) as avgScore,
            MAX(score) as maxScore,
            MIN(score) as minScore
        FROM records`,
        [],
        (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Failed to fetch stats' });
            }
            res.json(row || { total: 0, completed: 0, avgScore: 0, maxScore: 0, minScore: 0 });
        }
    );
});

// 获取个人最佳成绩
app.get('/api/personal-best/:name', (req, res) => {
    const name = req.params.name;
    
    db.get(
        'SELECT * FROM records WHERE name = ? ORDER BY score DESC LIMIT 1',
        [name],
        (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Failed to fetch personal best' });
            }
            res.json(row || null);
        }
    );
});

// AI Advisor（转发本地 Ollama；需运行 ollama serve 并已拉取模型）
app.post('/api/advisor', async (req, res) => {
    const body = req.body || {};
    const code = String(body.code ?? '').slice(0, 20000);
    const logsTail = String(body.logsTail ?? '').slice(0, 20000);
    const money = body.money;
    const farmState = body.farmState != null ? String(body.farmState) : '';
    const currentCrop = body.currentCrop != null ? String(body.currentCrop) : '';
    const growingSecondsLeft =
        body.growingSecondsLeft != null && body.growingSecondsLeft !== ''
            ? Number(body.growingSecondsLeft)
            : null;
    const challengeMode = !!body.challengeMode;
    const challengeTimeLeft =
        body.challengeTimeLeft != null ? Number(body.challengeTimeLeft) : null;
    const challengeGoal =
        body.challengeGoal != null ? Number(body.challengeGoal) : null;
    const locale = body.locale === 'zh' ? 'zh' : 'en';
    const advisorSystem = advisorSystemForLocale(locale);

    const userMsg = [
        '=== Session snapshot ===',
        `practice_or_challenge: ${challengeMode ? 'challenge' : 'practice'}`,
        challengeMode && challengeTimeLeft != null && !Number.isNaN(challengeTimeLeft)
            ? `challenge_time_left_seconds: ${challengeTimeLeft}`
            : null,
        challengeMode && challengeGoal != null && !Number.isNaN(challengeGoal)
            ? `challenge_goal_coins: ${challengeGoal}`
            : null,
        `money: ${money}`,
        `farm_state: ${farmState}`,
        `current_crop: ${currentCrop || '(none)'}`,
        farmState === 'growing' &&
        growingSecondsLeft != null &&
        !Number.isNaN(growingSecondsLeft)
            ? `growing_seconds_left: ${growingSecondsLeft}`
            : null,
        '',
        '=== Student code (for context only — do not repeat as code) ===',
        code || '(empty)',
        '',
        '=== Recent terminal output ===',
        logsTail || '(empty)',
    ]
        .filter((line) => line !== null)
        .join('\n');

    const controller = new AbortController();
    const kill = setTimeout(() => controller.abort(), 90000);

    try {
        let reply = await ollamaChat(
            [
                { role: 'system', content: advisorSystem },
                { role: 'user', content: userMsg },
            ],
            controller.signal,
        );

        if (locale === 'en' && replyLooksChineseForEnUi(reply)) {
            reply = await ollamaChat(
                [
                    { role: 'system', content: EN_TRANSLATE_SYSTEM },
                    {
                        role: 'user',
                        content: `Rewrite this teaching hint entirely in English (same bullets/structure). No code.\n\n---\n${reply}`,
                    },
                ],
                controller.signal,
            );
        }

        res.json({ reply, model: OLLAMA_MODEL });
    } catch (err) {
        const msg = err && err.name === 'AbortError' ? 'Advisor request timed out' : String(err.message || err);
        const hint =
            msg.includes('fetch') || msg.includes('ECONNREFUSED')
                ? `Cannot reach Ollama at ${OLLAMA_URL}. Run \`ollama serve\` on the server, set OLLAMA_URL / OLLAMA_MODEL if needed.`
                : msg;
        console.error('Advisor error:', msg);
        res.status(503).json({ error: hint });
    } finally {
        clearTimeout(kill);
    }
});

// React 生产构建（npm run build:client 之后由 Express 托管）
const clientDist = path.join(__dirname, 'client', 'dist');
const farmVideoDir = path.join(__dirname, 'farm video');
if (fs.existsSync(farmVideoDir)) {
    // Allow <video> from Vite dev (:5173) hitting Express (:3000) on another origin (mobile browsers).
    app.use('/farm-video', (req, res, next) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
    });
    app.use(
        '/farm-video',
        express.static(farmVideoDir, {
            maxAge: 86400000, // 1d — browsers reuse clips between reloads / state changes
            etag: true,
            lastModified: true,
        }),
    );
}
if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api).*/, (req, res) => {
        res.sendFile(path.join(clientDist, 'index.html'));
    });
}

// 启动服务器
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // 监听所有网络接口

app.listen(PORT, HOST, () => {
    console.log(`🚀 Harvest IT Server running on http://${HOST}:${PORT}`);
    console.log(`📊 API endpoints:`);
    console.log(`   GET  /api/health - 健康检查`);
    console.log(`   POST /api/submit - 提交成绩`);
    console.log(`   GET  /api/leaderboard - 获取排行榜`);
    console.log(`   GET  /api/stats - 获取统计信息`);
    console.log(`   GET  /api/personal-best/:name - 获取个人最佳成绩`);
    console.log(`   POST /api/advisor - AI advisor (Ollama @ ${OLLAMA_URL}, model ${OLLAMA_MODEL})`);
    console.log(`\n💡 提示：确保防火墙允许端口 ${PORT}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing database...');
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Database connection closed.');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\nSIGINT received, closing database...');
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Database connection closed.');
        process.exit(0);
    });
});



