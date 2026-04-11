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
        let t = m[1].trim().replace(/\|.*$/, '').trim();
        if (t.length < 2) return slug;
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
        let t = m2[1].trim().slice(0, 80);
        if (t.length < 2) return slug;
        const lower = t.toLowerCase();
        for (const pat of BAD_TITLE_PATTERNS) {
            if (lower.includes(pat.toLowerCase())) return slug;
        }
        return t;
    }
    return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

const content = lines.join('\n');
fs.writeFileSync(OUT_FILE, content);
console.log(`\nWritten: ${OUT_FILE} (${games.length} games)`);
