#!/usr/bin/env python3
"""
Quick targeted game fetcher - searches ~15-20 high-value queries to find
200-500 game repos, then downloads them using smart path prioritization.
Combines search + fetch in one pass, reuses logic from fetch.py.
"""
import urllib.request
import json
import os
import time
import re
import sys

TOKEN = os.environ.get('GH_TOKEN', '')

# =========================================================================
# CORE UTILITIES (from fetch.py / fetch_local.py)
# =========================================================================

SKIP_DIRS = {
    'node_modules', '.git', '.github', '__pycache__', 'coverage',
    '.circleci', '.vscode', 'vendor', 'bower_components', 'test', 'tests',
    'spec', 'specs', 'examples', 'docs', 'doc',
}

SKIP_EXT = {'.git', '.lock', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico'}


def gh(url):
    req = urllib.request.Request(url)
    if TOKEN:
        req.add_header('Authorization', 'token ' + TOKEN)
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('User-Agent', 'Mozilla/5.0')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  GH Error: {e}")
        return {}


def curl_raw(url):
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'Mozilla/5.0')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read()
    except:
        return None


def curl(url):
    d = curl_raw(url)
    return d.decode('utf-8', errors='ignore') if d else ""


def get_file(repo, path):
    """Get a single file from a repo."""
    try:
        item = gh(f"https://api.github.com/repos/{repo}/contents/{path}")
        if isinstance(item, dict) and item.get('download_url'):
            content = curl(item['download_url'])
            if content:
                return content, path, item.get('size', 0)
    except:
        pass
    return None, None, 0


def get_dir(repo, path=''):
    """Get directory listing."""
    try:
        url = (f"https://api.github.com/repos/{repo}/contents/{path}"
               if path else f"https://api.github.com/repos/{repo}/contents/")
        items = gh(url)
        if isinstance(items, list):
            return items
    except:
        pass
    return []


def get_dir_tree(repo, path='', depth=0, max_depth=3):
    """Get all files recursively up to max_depth."""
    if depth > max_depth:
        return []
    items = get_dir(repo, path)
    if not isinstance(items, list):
        return []
    files = []
    for item in items:
        if item.get('type') == 'file':
            files.append(item)
        elif item.get('type') == 'dir':
            n = item.get('name', '')
            if (n not in SKIP_DIRS and not n.startswith('.')
                    and n not in {'css', 'less', 'scss', 'sass',
                                  'images', 'img', 'fonts', 'media',
                                  'audio', 'video', 'lib'}):
                subpath = f"{path}/{n}" if path else n
                files.extend(get_dir_tree(repo, subpath, depth + 1, max_depth))
    return files


def score_html(content, path):
    """Score HTML for game quality."""
    if not content or len(content) < 500:
        return 0
    cl = content.lower()

    # Reject landing pages / readmes that lack game code
    if 'readme' in cl[:2000] or 'documentation' in cl[:2000]:
        if not any(x in cl for x in ['<canvas', 'requestanimationframe',
                                       'phaser', 'three', 'pixi', 'babylon']):
            return 0

    score = 0
    if '<canvas' in cl: score += 5
    if 'requestanimationframe' in cl: score += 4
    if 'addeventlistener' in cl: score += 2
    if 'phaser' in cl: score += 6
    if 'pixi' in cl: score += 5
    if 'three' in cl: score += 5
    if 'babylon' in cl: score += 5
    if 'getcontext' in cl: score += 3
    if 'ctx.' in cl: score += 2

    # Game mechanics
    for kw, w in [('player', 1), ('score', 2), ('level', 2), ('lives', 2),
                  ('enemy', 2), ('gravity', 2), ('collision', 2), ('sprite', 2),
                  ('game over', 3), ('game loop', 3), ('start game', 2),
                  ('high score', 2)]:
        if kw in cl:
            score += w

    # Prefer root or near-root
    depth = path.count('/')
    if depth == 0:
        score += 5
    elif depth == 1:
        score += 2

    score += min(len(content) / 10000, 4)
    return score


def categorize(content):
    if not content:
        return 'Arcade'
    cl = content.lower()
    cats = [
        (['tetris', 'block', 'brick', 'breakout'], 'Puzzle'),
        (['sudoku', '2048', 'word', 'crossword', 'jigsaw', 'mahjong'], 'Puzzle'),
        (['snake', 'flappy', 'crossy', 'endless', 'runner', 'maze'], 'Arcade'),
        (['shooter', 'bullet', 'zombie', 'invader'], 'Shooting'),
        (['platform', 'jump', 'frogger'], 'Platformer'),
        (['chess', 'checkers', 'draughts', 'connect', 'backgammon'], 'Board'),
        (['card', 'blackjack', 'poker', 'solitaire'], 'Card'),
        (['racing', 'car', 'driving'], 'Racing'),
        (['rpg', 'dungeon', 'adventure'], 'RPG'),
        (['tower defense', 'strategy', 'tactical'], 'Strategy'),
        (['physics', 'sand', 'particle', 'gravity'], 'Simulation'),
        (['3d', 'webgl', 'three', 'babylon'], '3D'),
    ]
    for keywords, cat in cats:
        if any(k in cl for k in keywords):
            return cat
    return 'Arcade'


def get_title(content, slug):
    if not content:
        return slug.replace('-', ' ').title()
    m = re.search(r'<title[^>]*>([^<]+)', content, re.I)
    if m:
        return m.group(1).strip()[:80]
    m = re.search(r'<h1[^>]*>([^<]+)', content, re.I)
    if m:
        return m.group(1).strip()[:80]
    return slug.replace('-', ' ').title()


def download_game_dir(repo, base_path, files, slug, out_dir='public/games'):
    """Download game directory preserving structure with CORRECTED path stripping."""
    dir_path = f'{out_dir}/{slug}'
    os.makedirs(dir_path, exist_ok=True)
    downloaded = 0

    for item in files:
        try:
            url = item.get('download_url')
            if not url:
                continue
            fpath = item.get('path', '')
            fname = item.get('name', '')
            if item.get('size', 0) > 500000:  # Skip files > 500KB
                continue

            content = curl_raw(url)
            if not content:
                continue

            # CORRECTED path stripping: handle both Windows and Unix separators
            full_dir = os.path.dirname(fpath).replace('\\', '/')
            base_clean = base_path.replace('\\', '/').rstrip('/')
            if full_dir == base_clean:
                rel_dir = ''
            elif full_dir.startswith(base_clean + '/'):
                rel_dir = full_dir[len(base_clean) + 1:]
            else:
                rel_dir = full_dir
            local_dir = dir_path if not rel_dir else os.path.join(dir_path, rel_dir)
            os.makedirs(local_dir, exist_ok=True)
            local_path = os.path.join(local_dir, fname)

            with open(local_path, 'wb') as out:
                out.write(content)
            downloaded += 1
        except Exception as e:
            pass

    return downloaded


# =========================================================================
# PRIORITY PATHS - check these first for actual game files
# =========================================================================
PRIORITY_PATHS = [
    '',           # root
    'dist', 'build', 'public', 'game', 'src', 'app', 'html',
    'web', 'client', 'out', 'bin', 'pages',
    'dist/game', 'dist/html', 'dist/src', 'dist/www',
    'build/game', 'build/html', 'build/src',
    'public/game', 'public/html', 'public/src',
    'docs/game', 'docs/html',
    'play', 'demo', 'example',
    'play/index.html', 'demo/index.html',
]

# =========================================================================
# HIGH-VALUE SEARCH QUERIES (~15-20 queries instead of 280)
# Each query targets a specific high-value category
# =========================================================================
SEARCH_QUERIES = [
    # Category leaders - highest value, most likely to be real games
    "2048 game javascript in:readme stars:>50",
    "hextris javascript game in:readme stars:>10",
    "phaser game javascript in:readme stars:>30",
    "pixi.js game javascript in:readme stars:>30",
    "three.js game javascript in:readme stars:>50",

    # Classic arcade clones - well-defined, playable
    "snake game javascript in:readme stars:>50",
    "tetris javascript game in:readme stars:>50",
    "pacman javascript game in:readme stars:>50",
    "pong javascript game in:readme stars:>30",
    "breakout javascript game in:readme stars:>30",
    "flappy bird clone javascript in:readme stars:>30",
    "chess javascript game in:readme stars:>30",
    "sudoku javascript game in:readme stars:>20",
    "mahjong javascript game in:readme stars:>20",
    "solitaire javascript game in:readme stars:>20",

    # Popular genres - broad coverage with high thresholds
    "roguelike javascript game in:readme stars:>80",
    "platformer javascript html5 game in:readme stars:>50",
    "tower defense javascript game in:readme stars:>50",
    "endless runner javascript game in:readme stars:>50",
    "match3 game javascript in:readme stars:>50",
    "racing game javascript in:readme stars:>30",

    # Competitions - js13k / Ludum Dare entries are self-contained
    "js13k game javascript in:readme stars:>30",
    "ludum dare game javascript in:readme stars:>30",

    # Browser-playable keywords
    "playable javascript game in:readme stars:>30",
    "browser game javascript arcade in:readme stars:>50",
    "html5 canvas game javascript in:readme stars:>100",
    "webgl game javascript in:readme stars:>50",

    # Genres with good yield
    "dungeon crawler javascript game in:readme stars:>30",
    "rpg javascript game in:readme stars:>50",
    "physics game javascript in:readme stars:>30",
    "sand game javascript in:readme stars:>30",
]


# =========================================================================
# KNOWN GOOD GAME REPOS - from fetch.py GAMES list + additional high-quality
# These are prioritized before search results
# =========================================================================
KNOWN_GAMES = [
    # From fetch.py GAMES list
    ('111116-webosu', '111116/webosu'),
    ('4ian-gdevelop', '4ian/GDevelop'),
    ('9001-copyparty', '9001/copyparty'),
    ('adarkroom', 'davekimpton/adarkroom'),
    ('alexnisnevich-untrusted', 'alexnisnevich/untrusted'),
    ('arham43-ops-gamehub', 'arham43/ops-gamehub'),
    ('auroriax-js13k-2020', 'auroriax/js13k-2020'),
    ('bdr76-lcdgame-js', 'bdr76/lcdgame-js'),
    ('beg-in-vue-babylonjs', 'beg-in/vue-babylonjs'),
    ('blazorguy-blazorgalaga', 'blazorguy/blazorgalaga'),
    ('bocaletto-luca-backgammon', 'bocaletto/luca-backgammon'),
    ('brandonaaron-connect4js', 'brandonaaron/connect4js'),
    ('btsan-checkersbot', 'btsan/checkersbot'),
    ('butzyung-systemanimatoronline', 'butzyung/systemanimatoronline'),
    ('chromegaming-gamesphere', 'chromegaming/GameSphere'),
    ('cloudkidstudio-pixiflash', 'CloudKidStudio/pixiflash'),
    ('coding-horror-basic-computer-games', 'coding-horror/basic-computer-games'),
    ('codyebberson-js13k-minipunk', 'codyebberson/js13k-minipunk'),
    ('daanvanyperen-odb-naturally-selected-2d', 'daanvanyperen/odb-naturally-selected-2d'),
    ('dannz510-crossy-road', 'dannz510/crossy-road'),
    ('draughts-draughts-github-io', 'draughts/draughts.github.io'),
    ('eamonnzhang-learning-pixi', 'eamonnzhang/learning-pixi'),
    ('ejazahmed-dev-crossy-road-game-clone', 'ejazahmed-dev/crossy-road-game-clone'),
    ('endlesscheng-mahjong-helper', 'endlesscheng/mahjong_helper'),
    ('engineersneedart-mooncraft2000', 'engineersneedart/mooncraft2000'),
    ('equim-chan-mortal', 'equim-chan/mortal'),
    ('gabrielecirulli-2048', 'gabrielecirulli/2048'),
    ('grwhitehead-jsmcts', 'grwhitehead/jsmcts'),
    ('greypants-blastengine', 'greypants/blastengine'),
    ('hambo3-kitaku', 'hambo3/kitaku'),
    ('hextris-hextris', 'Hextris/Hextris'),
    ('hoorayimhelping-galaga5', 'hoorayimhelping/galaga5'),
    ('hrbrmstr-pewpew', 'hrbrmstr/pewpew'),
    ('icecreamyou-html5-canvas-game-boilerplate', 'icecreamyou/HTML5-Canvas-Game-Boilerplate'),
    ('jackrugile-radius-raid-js13k', 'jackrugile/radius-raid-js13k'),
    ('jakesgordon-javascript-pong', 'jakesgordon/javascript-pong'),
    ('jakesgordon-javascript-tetris', 'jakesgordon/javascript-tetris'),
    ('jameesy-rossy-croad', 'jameesy/rossy-croad'),
    ('jojoee-phaser-examples', 'jojoee/jojoee-phaser-examples'),
    ('judnich-kosmos', 'judnich/kosmos'),
    ('kaigani-html5-games-list', 'kaigani/html5-games-list'),
    ('kevinalbs-connect4', 'kevinalbs/connect4'),
    ('killedbyapixel-bounceback', 'killedbyapixel/bounceback'),
    ('killedbyapixel-os13k', 'killedbyapixel/os13k'),
    ('knadh-wordpluck', 'knadh/wordpluck'),
    ('kunjgit-gamezone', 'kunjgit/GameZone'),
    ('laineus-phavuer', 'laineus/phavuer'),
    ('masonicgit-pacman', 'masonicgit/pacman'),
    ('mattskala-html5-bombergirl', 'mattskala/html5-bombergirl'),
    ('maxbittker-sandspiel', 'maxbittker/sandspiel'),
    ('mdsahil011-crossy-road-game', 'mdsahil011/crossy-road-game'),
    ('melluo-treat-retriever', 'melluo/treat-retriever'),
    ('microsoftedge-sudoku', 'microsoftEdge/sudoku'),
    ('monthpity-moon-room', 'monthpity/moon-room'),
    ('ncase-wbwwb', 'ncase/wbwwb'),
    ('nebez-floppybird', 'nebez/floppybird'),
    ('nonstopgames-acow', 'nonstopgames/acow'),
    ('noowxela-phaser-examples', 'noowxela/phaser-examples'),
    ('oli8-blackjackjs', 'oli8/blackjackjs'),
    ('omarshehata-i-spy-a-ghost', 'omarshehata/i-spy-a-ghost'),
    ('phoboslab-q1k3', 'phoboslab/q1k3'),
    ('platzhersch-pacman-canvas', 'platzhersh/pacman-canvas'),
    ('pomax-mahjong', 'pomax/mahjong'),
    ('rekindleos-rekindle', 'rekindleos/rekindle'),
    ('sahlamba-connect4', 'sahlamba/connect4'),
    ('saket-db-crossy-roads-game-main', 'saket-db/crossy-roads-game-main'),
    ('shaunlebron-bl1nd-ld28', 'shaunlebron/bl1nd-ld28'),
    ('shubhendusaurabh-draughtsboardjs', 'shubhendusaurabh/DraughtsBoardJS'),
    ('sinceraxy-gamehub', 'sinceraxy/gamehub'),
    ('somyadipghosh-web-games', 'somyadipghosh/web-games'),
    ('starzonmyarmz-js13k-2018', 'starzonmyarmz/js13k-2018'),
    ('tetris-ce', 'tachSysen/tetris'),
    ('thirdcommand-geowars', 'thirdcommand/geowars'),
    ('unanimousaditya-crossy-road-game', 'unanimousaditya/crossy-road-game'),
    ('vnglst-pong-wars', 'vnglst/pong-wars'),
    ('wanghao221-moyu', 'wanghao221/moyu'),
    ('woonseah-crossy-camp', 'woonseah/crossy-camp'),

    # Additional known high-quality game repos not in the GAMES list
    ('aerolab-blockrain-js', 'aerolab/blockrain.js'),
    ('end3r-platformer-game-template', 'end3r/HTML5-Game-Development'),
    ('superguigui-quintus', 'superguigui/quintus'),
    ('kittykatattack-phaser-tutorial', 'kittykatattack/Phaser'),
    ('photonstorm-phaser-examples', 'photonstorm/phaser-examples'),
    ('photonstorm-phaser-tutorials', 'photonstorm/phaser3-examples'),
    ('leanforge-snake-game', 'leanforge/snake-game'),
    ('stephenmkim-tiny-pong', 'stephenmkim/tiny-pong'),
    ('lhor惯性-gravity-game', 'lhor惯性/gravity-game'),
    ('slanha-tetris', 'slanha/tetris'),
    ('yairch-tweetable-2048', 'yairch/tweetable-2048'),
    ('mgechev-2048-ai', 'mgechev/2048-ai'),
    ('niekmeijer-tetris', 'niekmeijer/tetris'),
    ('skyler-lipman-2048', 'skyler-lipman/2048'),
    ('yudai-nettico-2048-clone', 'yudai-nettico/2048-clone'),
    ('tinfoil-tetris', 'tinfoil/tetris'),
    ('karthikkalyan90-connect-four', 'karthikkalyan90/connect-four'),
    ('skullops-connect-four', 'skullops/connect-four'),
    ('lukefabbian-cell-team-6-game', 'lukefabbian/cell-team-6-game'),
    ('gamedolphin-minesweeper', 'gamedolphin/minesweeper'),
    ('platzhersh-pacman-html5', 'Platzh1rsk/pacman-html5'),
    ('chvin-react-tetris', 'chvin/react-tetris'),
    ('skammer-css-diner', 'skammer/css-diner'),
    ('fabianmoronzirwas-flappy', 'fabianmoronzirwas/flappy'),
    ('ellisonleao-clumsy-bird', 'ellisonleao/clumsy-bird'),
    ('samirkhan-abc-hammer', 'samirkhan/abc-hammer'),
    ('jakesgordon-jump', 'jakesgordon/jump'),
    ('mdyn-8-bit-runner', 'mdyn/8-bit-runner'),
    ('straker-gitpark', 'straker/gitpark'),
    ('alexnisnevich-kalevetron', 'alexnisnevich/kalevetron'),
    ('gverbock-gemgem', 'gverbock/gemgem'),
    ('christopherkesson-sokoban', 'christopherkesson/sokoban'),
    ('phoboslab-jspot', 'phoboslab/jspot'),
    ('nickp Real', 'nickp10/Real'),
]


def make_slug(repo):
    """Create a URL-safe slug from repo name."""
    return ''.join(c if c.isalnum() else '-' for c in repo.lower()).strip('-')[:60]


def is_framework_repo(name, description=''):
    """Skip repos that are clearly frameworks/boilerplates, not games."""
    name_lower = name.lower()
    desc_lower = (description or '').lower()

    # These are frameworks, boilerplates, or non-game repos
    skip_patterns = [
        'starter', 'template', 'boilerplate', 'seed', 'scaffold',
        'framework', 'engine', 'library', 'sdk', 'toolkit',
        'demo', 'example', 'tutorial', 'lesson', 'course',
        'playground', 'sandbox', 'experiment',
    ]
    skip_names = [
        'phaser-examples', 'phaser-tutorials', 'pixi-examples',
        'three-examples', 'threejs-examples', 'game-engine',
        'game-framework', 'game-library', 'html5-game-framework',
    ]

    for pat in skip_patterns:
        if pat in name_lower and 'example' in name_lower:
            return True
    if name_lower in skip_names:
        return True
    return False


def fetch_one_game(repo, slug):
    """Fetch a single game repo. Returns (title, cat, downloaded_count) or None."""
    try:
        best_content = None
        best_score = 0
        best_path = ''

        # Phase 1: Try priority paths with index.html / game.html / play.html
        priority_files = [
            'index.html', 'game.html', 'play.html', 'play/index.html',
            'demo.html', 'demo/index.html', 'src/index.html',
            'dist/index.html', 'build/index.html',
        ]

        for pf in priority_files:
            content, fp, sz = get_file(repo, pf)
            if content:
                score = score_html(content, fp)
                if score > best_score:
                    best_score = score
                    best_content = content
                    best_path = fp

        # Phase 2: If no good HTML found, scan tree for HTML files
        if best_score < 5:
            all_files = get_dir_tree(repo, max_depth=2)
            html_files = [
                f for f in all_files
                if f.get('name', '').endswith('.html')
                or f.get('name', '').endswith('.htm')
            ]
            # Sort by name preference: index, game, play first
            def html_sort_key(f):
                n = f.get('name', '').lower()
                if n == 'index.html':
                    return 0
                if n == 'game.html':
                    return 1
                if n == 'play.html':
                    return 2
                if n in ('index.htm', 'index.html'):
                    return 3
                return 4

            html_files.sort(key=html_sort_key)
            for f in html_files[:20]:
                url = f.get('download_url')
                if not url:
                    continue
                content = curl(url)
                if not content:
                    continue
                fp = f.get('path', '')
                score = score_html(content, fp)
                if score > best_score:
                    best_score = score
                    best_content = content
                    best_path = fp

        if not best_content or best_score < 5:
            return None

        # Phase 3: Download the game directory
        base = best_path.rsplit('/', 1)[0] if '/' in best_path else ''
        if base:
            dir_files = get_dir_tree(repo, base, max_depth=3)
        else:
            dir_files = get_dir_tree(repo, '', max_depth=2)

        # Filter to relevant game files (include images/audio/fonts, skip huge files)
        game_files = []
        for f in dir_files:
            n = f.get('name', '').lower()
            ext = n.split('.')[-1] if '.' in n else ''
            # Include: html, js, json, wasm, txt, md, audio, fonts, images
            if ext in {
                '', 'html', 'htm', 'js', 'json', 'wasm', 'txt', 'md',
                'mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac',
                'woff', 'woff2', 'ttf', 'otf', 'eot', 'svg',
                'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico',
                'ogv', 'mp4', 'webm',
            }:
                game_files.append(f)

        downloaded = download_game_dir(repo, base, game_files, slug)
        cat = categorize(best_content)
        return best_content, cat, downloaded, best_score

    except Exception as e:
        print(f"  Error: {e}")
        return None


# =========================================================================
# MAIN: Quick targeted search + fetch in one pass
# =========================================================================

def main():
    out_dir = 'public/games'
    os.makedirs(out_dir, exist_ok=True)

    print("=" * 60)
    print("QUICK TARGETED GAME FETCHER")
    print("=" * 60)

    # ----------------------------------------------------------------
    # STEP 1: Collect repos from known games + search queries
    # ----------------------------------------------------------------
    all_repos = {}
    seen = set()

    # First: add all known games (highest priority)
    print(f"\n[PHASE 1] Known game repos ({len(KNOWN_GAMES)} repos)...")
    for slug, repo in KNOWN_GAMES:
        if repo not in seen:
            all_repos[repo] = ('known', slug)
            seen.add(repo)

    # Second: search queries (deduplicated)
    print(f"\n[PHASE 2] Searching {len(SEARCH_QUERIES)} targeted queries...")
    for i, q in enumerate(SEARCH_QUERIES):
        print(f"  [{i+1}/{len(SEARCH_QUERIES)}] {q[:55]}...", end='', flush=True)
        try:
            data = gh(
                f"https://api.github.com/search/repositories"
                f"?q={q.replace(' ', '%20')}&per_page=30&sort=stars"
            )
            items = data.get('items', [])
            count = 0
            for item in items:
                repo = item['full_name']
                if repo not in seen:
                    name = item.get('name', '')
                    desc = item.get('description', '')
                    if is_framework_repo(name, desc):
                        continue
                    all_repos[repo] = ('search', make_slug(repo))
                    seen.add(repo)
                    count += 1
            print(f" -> {len(items)} found ({count} new, total: {len(all_repos)})")
            time.sleep(1.2)  # Respect rate limits
        except Exception as e:
            print(f" Error: {e}")
            time.sleep(3)

    print(f"\n=== TOTAL REPOS TO FETCH: {len(all_repos)} ===")

    # Save repo list
    repos_path = '/tmp/repos_quick.txt'
    with open(repos_path, 'w') as f:
        for repo, (source, slug) in sorted(all_repos.items()):
            f.write(f"{repo}\t{slug}\t{source}\n")
    print(f"Saved repo list to {repos_path}")

    # ----------------------------------------------------------------
    # STEP 3: Fetch all games
    # ----------------------------------------------------------------
    print(f"\n[PHASE 3] Fetching all games...")

    OK = 0
    FAIL = 0
    SKIP = 0
    TOTAL_FILES = 0
    i = 0
    total = len(all_repos)

    for repo, (source, slug) in all_repos.items():
        i += 1
        print(f"\n[{i}/{total}] {repo}...", end='', flush=True)

        # Skip if already exists with content
        game_path = f"{out_dir}/{slug}"
        if os.path.isdir(game_path):
            existing_files = [
                f for f in os.listdir(game_path)
                if os.path.isfile(os.path.join(game_path, f))
            ]
            if len(existing_files) >= 3:
                print(f" SKIP (already exists: {len(existing_files)} files)")
                SKIP += 1
                continue

        result = fetch_one_game(repo, slug)
        if result:
            content, cat, downloaded, score = result
            print(f" OK ({downloaded} files, score={score}, cat={cat})")
            OK += 1
            TOTAL_FILES += downloaded
        else:
            print(f" FAIL")
            FAIL += 1

        time.sleep(0.2)

    # ----------------------------------------------------------------
    # SUMMARY
    # ----------------------------------------------------------------
    print("\n" + "=" * 60)
    print("FINAL RESULTS")
    print("=" * 60)
    print(f"  OK:   {OK}")
    print(f"  FAIL: {FAIL}")
    print(f"  SKIP: {SKIP}")
    print(f"  Total files downloaded: {TOTAL_FILES}")
    print(f"  Total repos processed:  {i}")
    print("=" * 60)

    return OK, FAIL, SKIP, TOTAL_FILES


if __name__ == '__main__':
    main()
