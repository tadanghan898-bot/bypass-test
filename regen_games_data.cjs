#!/usr/bin/env node
/**
 * Regenerate games_data.js by scanning actual game directories
 * Only includes games that have actual content (files > 0)
 */
const fs = require('fs');
const path = require('path');

const GAMES_DIR = 'public/games';
const OUT_FILE = 'server/games_data.js';

// Skip known non-game repos that might slip through
const SKIP_SLUGS = new Set([
    'ch11-stock-ticker',
    'using-standard-html',
    'optimized-for-simplicity-and-ea',
    'games-platforms',
    'caliwyr-Software',
    'noah--d2bs',
    // Non-game repos that pass hasGameCode() threshold
    'salma-emara-ece244-book',
    'albertzak-open',
    'cipher387-osint-stuff-tool-collection',
    'cipher387-osint_stuff_tool_collection',
    'dhairyagothi-100-days-100-web-project',
    'dhairyagothi-100_days_100_web_project',
    'areso-1255-burgomaster',
    'TheVisualHub-CodeForge',
    'GuilhermeRossato-3D-Redstone-Simulator',
    '9001-copyparty',
    'mark-hahn-coffeekup-intro',
    'aframevr-aframe',
    'adobe-accessibility-Accessible-Mega-Menu',
    // More non-game repos: editors, demos, tutorials, benchmarks
    'ajaxorg-ace',
    'MEDELBOU3-3d_editor',
    'hiukim-mind-ar-js',
    'collidingscopes-threejs-handtracking-101',
    'collidingscopes-liquid-shape-distortions',
    'collidingscopes-particular-drift',
    'Nugget8-Three.js-Ocean-Scene',
    'PacktPublishing-Real-Time-3D-Graphics-with-WebGL-2',
    'akanasoftware',
    'my-lambda-projects-Lambda',
    // Emulators, vim plugins, WASM demos
    'ArchUsr64-6502_emulator',
    '1995eaton-chromium-vim',
    // Non-game repos (bookwyrms, histograms, mustache, typeplate, etc.)
    'bookwyrm-social-bookwyrm',
    'HdrHistogram-HdrHistogram',
    'laineus-phavuer',
    'merlinepedra-osint-stuff-tool-collection',
    'mustache-mustache',
    'typeplate-typeplate.github.io',
    'feijiqun-feijiqun.github.io',
    'cloudkidstudio-pixiflash',
    'icecreamyou-html5-canvas-game-boilerplate',
    // Repo-name-as-title slugs that are non-games
    'Bercon-VIRGO-1302',
    'jzitelli-poolvr',
    'drawcall-three.proton',
    'SalvatorePreviti-js13k-2020',
    'SalvatorePreviti-js13k-2022',
    'ImBIOS-lab-snake-reverse',
    'Dicklesworthstone-asupersync',
    'azgaar-fantasy-map-generator',
    'ssatguru-BabylonJS-CharacterController',
    'liuliangsir-chromium-style-qrcode-generator-with-wasm',
    'ajlopez-JavaScriptAI',
    'chaosprint-glicol',
    'redblobgames-mapgen2',
    'zeux-meshoptimizer',
    'rogeryi-wx_mini_game_demo',
    'cool-japan-spintronics',
    'font_tool',
    'phoboslab-high_impact',
    'schibo-1964js',
    'achliopa-udacity_interactive3dGraphics',
    'aftertheflood-sparks',
    'ChrisKnott-Algojammer',
    'zufuliu-notepad4',
    'anilsathyan7-Portrait-Segmentation',
    'mapbox-mapbox-gl-js',
    'sessamekesh-wasm-3d-animation-demo',
    'curran-screencasts',
    'Annoraaq-grid-engine',
    'ramanuj-droid-Anti-Boredom',
    'jasmineroberts-xr-stack',
    'tiansijie-Tile_Based_WebGL_DeferredShader',
    'kestrelm-Creature_WebGL',
    'leerichard42-WebGL-Unified-Particle-System',
    'turbulenz-webgl_benchmark',
    'donikv-webGl-dithering',
    'antimatter15-splat',
    'driule-webgl-path-tracer',
    'wulinjiansheng-WebGL_PathTracer',
    'WebGLInsights-WebGLInsights-1',
    'codyebberson-wglt',
    'tengge1-ShadowEditor',
    'wwwtyro-vixel-editor',
    'OscarGodson-EpicEditor',
    'apbodnar-FSPT',
    'hunterloftis-pathtracer',
    'ruvnet-RuVector',
    'muzi-8-Visual-analytics-and-Interpretability-in-Deep-Learning',
    'xviniette-FlappyLearning',
    'jojoee-phaser-examples',
    'noowxela-phaser-examples',
    'akkana-scripts',
    'dannz510-crossy-road',
    'donandyv-Game',
    'ippa-jaws',
]);

function extractTitle(content, slug) {
    // Reject template placeholder titles
    const BAD_TITLE_PATTERNS = [
        '{{', '}}', '{title}', '{Title}', '{title}', '<!--', '{{{',
        '{{title}}', '{{ title }}', 'play ', 'Play ',
        'Boilerplate', 'Starter', 'Template',
    ];
    const m = content.match(/<title[^>]*>([^<]+)/i);
    if (m) {
        let t = m[1].trim().replace(/\|.*$/, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
        // Decode common HTML entities
        t = t.replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        if (t.length < 3) return slug;
        if (t.length < 3) return slug;
        // Reject emoji-only, number-only, date-only, code-pattern titles
        if (/^[\d\s\-\.\/#:]+$/.test(t)) return slug;
        if (/^[🌟⭐🕹️💎🎮🚀⭐✨🎯💰🔥🎮🏆🎲]+$/.test(t)) return slug;
        if (/^\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i.test(t)) return slug;
        if (/^Update\s*#?\d+/i.test(t)) return slug;
        // Reject question/statement titles that are clearly not game names
        if (/^(How|What|Why|Can|Is|Do|Does|When|Where|Which)/i.test(t) && t.includes('?')) return slug;
        // Reject titles starting with library/framework names
        if (/^(Mapbox|Three\.?js|WebGL|Babylon|PlayCanvas|A-Frame|Phaser|Pixi|Cannon\.?js|Ammo\.?js|Verlet|Box2D|Unity|Unreal|Ogre|Three\.?js)/i.test(t)) return slug;
        // Strip common README/boilerplate suffixes
        // Strip common README/boilerplate suffixes
        t = t.replace(/,\s*using\s+(standard\s+)?HTML.*$/i, '');
        t = t.replace(/\s*[-—]\s*(Handcrafted\s+)?starter.*$/i, '');
        t = t.replace(/\s*[-—]\s*(Universal\s+)?Web[45].*$/i, '');
        t = t.replace(/\s*[-—]\s*Functional.*$/i, '');
        t = t.trim();
        if (t.length < 2) return slug;
        const lower = t.toLowerCase();
        for (const pat of BAD_TITLE_PATTERNS) {
            if (lower.includes(pat.toLowerCase())) return slug;
        }
        return t.slice(0, 80);
    }
    const m2 = content.match(/<h1[^>]*>([^<]+)/i);
    if (m2) {
        let t = m2[1].trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
        t = t.replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
        if (t.length < 3) return slug;
        const lower = t.toLowerCase();
        for (const pat of BAD_TITLE_PATTERNS) {
            if (lower.includes(pat.toLowerCase())) return slug;
        }
        return t;
    }
    const fallback = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (fallback.length < 3) return slug;
    // Reject emoji-only fallbacks
    if (/^[\s🌟⭐🕹️💎🎮🚀✨🎯💰🔥🏆🎲]+$/.test(fallback)) return slug;
    // Reject slug-based titles that start with library names
    if (/^(Three|Webgl|Babylon|Phaser|Pixi|Cannon|Ammo|Mapbox|Aframe)/i.test(fallback)) return slug;
    return fallback;
}

function hasGameCode(content) {
    if (!content) return false;
    const cl = content.toLowerCase();
    let score = 0;
    if (cl.includes('<canvas')) score += 5;
    if (cl.includes('requestanimationframe')) score += 4;
    if (cl.includes('addeventlistener')) score += 2;
    if (cl.includes('phaser') || cl.includes('pixi') || cl.includes('three')) score += 5;
    if (cl.includes('getcontext')) score += 3;
    if (cl.includes('ctx.')) score += 2;
    for (const kw of ['player', 'score', 'level', 'lives', 'enemy', 'gravity', 'collision']) {
        if (cl.includes(kw)) score += 1;
    }
    return score >= 4;
}

function extractCategory(content) {
    if (!content) return 'Arcade';
    const cl = content.toLowerCase();
    const cats = [
        [['tetris', 'block', 'brick', 'breakout', 'arkanoid'], 'Puzzle'],
        [['sudoku', '2048', 'wordle', 'crossword', 'jigsaw', 'mahjong', 'word'], 'Puzzle'],
        [['snake', 'flappy', 'crossy', 'endless', 'runner', 'maze', 'maze'], 'Arcade'],
        [['shooter', 'bullet hell', 'invader', 'galaga', 'zombie', 'turret', 'shoot'], 'Shooting'],
        [['platform', 'jump', 'frogger', 'doodle'], 'Platformer'],
        [['chess', 'checkers', 'draughts', 'connect four', 'backgammon'], 'Board'],
        [['card', 'blackjack', 'poker', 'solitaire', 'spider', 'rummy'], 'Card'],
        [['racing', 'car', 'driving', 'moto', 'race'], 'Racing'],
        [['rpg', 'dungeon', 'adventure', 'crawl'], 'RPG'],
        [['tower defense', 'strategy', 'tactical'], 'Strategy'],
        [['physics', 'sandbox', 'particle', 'gravity', 'life sim', 'conway'], 'Simulation'],
        [['3d', 'webgl', 'three', 'babylon', 'voxel', 'cube'], '3D'],
    ];
    for (const [keywords, cat] of cats) {
        if (keywords.some(k => cl.includes(k))) return cat;
    }
    return 'Arcade';
}

function getGameFiles(dir) {
    const files = [];
    try {
        for (const f of fs.readdirSync(dir)) {
            const fp = path.join(dir, f);
            if (fs.statSync(fp).isFile()) {
                files.push(f);
            }
        }
    } catch (e) {}
    return files;
}

function findMainHtml(dir) {
    // Try index.html first
    const candidates = ['index.html', 'game.html', 'play.html', 'demo.html'];
    for (const c of candidates) {
        const fp = path.join(dir, c);
        if (fs.existsSync(fp)) {
            try {
                const content = fs.readFileSync(fp, 'utf-8');
                if (content.length > 500 && hasGameCode(content)) return { file: c, content };
            } catch (e) {}
        }
    }
    // Scan all HTML files
    try {
        for (const f of fs.readdirSync(dir)) {
            const fp = path.join(dir, f);
            if (fs.statSync(fp).isFile() && f.endsWith('.html')) {
                try {
                    const content = fs.readFileSync(fp, 'utf-8');
                    if (content.length > 500 && hasGameCode(content)) {
                        return { file: f, content };
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}
    return null;
}

function getDescription(title, cat) {
    const t = title.toLowerCase();
    if (t.includes('snake')) return `Play ${title} - Classic snake arcade game!`;
    if (t.includes('tetris')) return `Play ${title} - Block puzzle challenge!`;
    if (t.includes('2048')) return `Play ${title} - Number puzzle game!`;
    if (t.includes('sudoku')) return `Play ${title} - Number puzzle challenge!`;
    if (t.includes('chess')) return `Play ${title} - Classic board game!`;
    if (t.includes('pacman')) return `Play ${title} - Classic arcade game!`;
    if (t.includes('breakout')) return `Play ${title} - Break the bricks!`;
    if (t.includes('space invader')) return `Play ${title} - Space shooter arcade!`;
    if (t.includes('flappy')) return `Play ${title} - Flying challenge!`;
    if (t.includes('mario') || t.includes('platformer')) return `Play ${title} - Platform adventure!`;
    if (t.includes('shooter') || t.includes('shooting')) return `Play ${title} - Action shooter!`;
    if (t.includes('racing') || t.includes('car') || t.includes('race')) return `Play ${title} - Racing challenge!`;
    if (t.includes('sudoku')) return `Play ${title} - Puzzle game!`;
    if (t.includes('mahjong')) return `Play ${title} - Tile matching!`;
    if (t.includes('minessweeper')) return `Play ${title} - Mine clearing!`;
    if (t.includes('wordle')) return `Play ${title} - Word puzzle!`;
    if (t.includes('rpg') || t.includes('dungeon')) return `Play ${title} - RPG adventure!`;
    if (t.includes('tower defense')) return `Play ${title} - Strategy defense!`;
    if (t.includes('card') || t.includes('blackjack') || t.includes('solitaire')) return `Play ${title} - Card game!`;
    if (t.includes('connect four')) return `Play ${title} - Connect four!`;
    if (t.includes('checkers') || t.includes('draughts')) return `Play ${title} - Checkers game!`;
    return `Play ${title} - ${cat} game!`;
}

console.log('Scanning game directories...');
const dirs = fs.readdirSync(GAMES_DIR).filter(d => {
    try {
        return fs.statSync(path.join(GAMES_DIR, d)).isDirectory();
    } catch (e) { return false; }
});

console.log(`Found ${dirs.length} game directories`);

const games = [];
let noFiles = 0;
let noContent = 0;
let parsed = 0;

for (const dir of dirs) {
    if (SKIP_SLUGS.has(dir)) continue;

    const dirPath = path.join(GAMES_DIR, dir);
    const files = getGameFiles(dirPath);

    if (files.length === 0) {
        noFiles++;
        continue;
    }

    const main = findMainHtml(dirPath);
    if (!main) {
        noContent++;
        continue;
    }

    const title = extractTitle(main.content, dir);
    const cat = extractCategory(main.content);
    const desc = getDescription(title, cat);
    const slug = dir;
    const href = `/games/${slug}/${main.file}`;
    const fileCount = files.length;

    games.push([title, slug, desc, cat, href, fileCount, 0, 0]);
    parsed++;
}

console.log(`\nSummary:`);
console.log(`  Total directories: ${dirs.length}`);
console.log(`  Empty dirs (skipped): ${noFiles}`);
console.log(`  No valid HTML (skipped): ${noContent}`);
console.log(`  Valid games: ${parsed}`);

// Sort by title
games.sort((a, b) => a[0].localeCompare(b[0]));

// Generate games_data.js
const lines = ['const games = ['];
for (const g of games) {
    lines.push(`  [${g.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : v).join(', ')}],`);
}
lines.push('];');
lines.push('\nif (typeof module !== "undefined" && module.exports) {');
lines.push('  module.exports = games;');
lines.push('}');
lines.push('\nexport { games };');

const content = lines.join('\n');
fs.writeFileSync(OUT_FILE, content);
console.log(`\nWritten: ${OUT_FILE} (${games.length} games)`);
