#!/usr/bin/env python3
"""
MEGA PARALLEL GAME FETCHER - Ultra-fast concurrent game fetching
- 50+ targeted search queries
- Concurrent fetching with semaphore limiting
- Quality scoring + category detection
- Best games from GitHub
"""
import urllib.request
import json
import os
import time
import re
import sys
import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Semaphore

TOKEN = os.environ.get('GH_TOKEN', '')

# =========================================================================
# UTILITIES
# =========================================================================

SKIP_DIRS = {
    'node_modules', '.git', '.github', '__pycache__', 'coverage',
    '.circleci', '.vscode', 'vendor', 'bower_components', 'test', 'tests',
    'spec', 'specs', 'examples', 'docs', 'doc',
}

def gh(url):
    req = urllib.request.Request(url)
    if TOKEN:
        req.add_header('Authorization', 'token ' + TOKEN)
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('User-Agent', 'Mozilla/5.0')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except:
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
    if not content or len(content) < 500:
        return 0
    cl = content.lower()
    if 'readme' in cl[:2000] or 'documentation' in cl[:2000]:
        if not any(x in cl for x in ['<canvas', 'requestanimationframe', 'phaser', 'three', 'pixi', 'babylon']):
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
    for kw, w in [('player', 1), ('score', 2), ('level', 2), ('lives', 2),
                  ('enemy', 2), ('gravity', 2), ('collision', 2), ('sprite', 2),
                  ('game over', 3), ('game loop', 3), ('start game', 2),
                  ('high score', 2)]:
        if kw in cl:
            score += w
    depth = path.count('/')
    if depth == 0: score += 5
    elif depth == 1: score += 2
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


def download_game_dir(repo, base_path, files, slug, out_dir='public/games'):
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
            if item.get('size', 0) > 500000:
                continue
            content = curl_raw(url)
            if not content:
                continue
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
        except:
            pass
    return downloaded


# =========================================================================
# 50+ SEARCH QUERIES - ultra comprehensive
# =========================================================================
SEARCH_QUERIES = [
    # === CLASSICS ===
    "2048 game javascript in:readme stars:>30",
    "tetris javascript game in:readme stars:>30",
    "snake game javascript in:readme stars:>30",
    "pacman javascript game in:readme stars:>30",
    "breakout javascript game in:readme stars:>20",
    "pong javascript game in:readme stars:>20",
    "flappy bird clone javascript in:readme stars:>20",
    "space invaders javascript in:readme stars:>30",
    "minesweeper javascript game in:readme stars:>20",
    "chess javascript game in:readme stars:>20",
    "sudoku javascript game in:readme stars:>20",
    "solitaire javascript game in:readme stars:>20",
    "mahjong javascript game in:readme stars:>20",
    "blackjack javascript game in:readme stars:>20",
    "connect four javascript in:readme stars:>20",
    "checkers javascript game in:readme stars:>15",
    "backgammon javascript in:readme stars:>15",

    # === FRAMEWORKS ===
    "phaser game javascript in:readme stars:>30",
    "pixi.js game javascript in:readme stars:>30",
    "pixi game javascript in:readme stars:>30",
    "three.js game javascript in:readme stars:>40",
    "three.js game html5 in:readme stars:>30",
    "babylon.js game javascript in:readme stars:>30",
    "quintus javascript game in:readme stars:>20",
    "phaser3 game javascript in:readme stars:>30",

    # === GENRES ===
    "hextris javascript in:readme stars:>10",
    "roguelike javascript game in:readme stars:>50",
    "platformer javascript html5 game in:readme stars:>30",
    "tower defense javascript game in:readme stars:>30",
    "endless runner javascript game in:readme stars:>30",
    "match3 game javascript in:readme stars:>30",
    "racing game javascript html5 in:readme stars:>20",
    "dungeon crawler javascript game in:readme stars:>20",
    "rpg javascript game html5 in:readme stars:>30",
    "physics game javascript sandbox in:readme stars:>20",
    "sokoban javascript game in:readme stars:>15",
    "asteroids javascript game in:readme stars:>15",
    "arkanoid javascript game in:readme stars:>15",

    # === COMPETITIONS ===
    "js13k game javascript in:readme stars:>20",
    "ludum dare game javascript in:readme stars:>20",
    "gmtk game jam javascript in:readme stars:>20",
    "one game a month javascript in:readme stars:>20",

    # === BROAD COVERAGE ===
    "html5 canvas game javascript in:readme stars:>50",
    "browser game javascript arcade in:readme stars:>30",
    "playable javascript game in:readme stars:>30",
    "webgl game javascript html5 in:readme stars:>30",
    "pixel art javascript game in:readme stars:>30",
    "retro javascript game html5 in:readme stars:>30",
    "multiplayer javascript game in:readme stars:>40",
    "tutorial javascript game in:readme stars:>30",
]

# Additional very specific high-value queries
EXTRA_QUERIES = [
    "crossy road javascript in:readme stars:>15",
    "frogger javascript game in:readme stars:>15",
    "simon says javascript in:readme stars:>15",
    "wordle javascript clone in:readme stars:>20",
    "flappy javascript game in:readme stars:>20",
    "doodle jump javascript in:readme stars:>15",
    "puzzle game javascript html5 in:readme stars:>30",
    "arcade game javascript html5 in:readme stars:>30",
    "2d game javascript canvas in:readme stars:>30",
    "3d game javascript webgl in:readme stars:>30",
    "ball game javascript physics in:readme stars:>20",
    "pinball javascript game in:readme stars:>15",
    "shooter game javascript canvas in:readme stars:>20",
    "turret defense javascript in:readme stars:>15",
    "zombie game javascript html5 in:readme stars:>20",
    "tank game javascript html5 in:readme stars:>15",
    "bird game javascript html5 in:readme stars:>15",
    "fishing game javascript in:readme stars:>15",
    "soccer game javascript in:readme stars:>15",
    "basketball game javascript in:readme stars:>15",
]
SEARCH_QUERIES.extend(EXTRA_QUERIES)


# =========================================================================
# KNOWN HIGH-QUALITY GAME REPOS
# =========================================================================
KNOWN_GAMES = [
    # Classics
    ('gabrielecirulli-2048', 'gabrielecirulli/2048'),
    ('hextris-hextris', 'Hextris/Hextris'),
    ('jakesgordon-javascript-tetris', 'jakesgordon/javascript-tetris'),
    ('jakesgordon-javascript-pong', 'jakesgordon/javascript-pong'),
    ('masonicgit-pacman', 'masonicgit/pacman'),
    ('nebez-floppybird', 'nebez/floppybird'),
    ('jakesgordon-jump', 'jakesgordon/jump'),
    ('microsoftedge-sudoku', 'microsoftEdge/sudoku'),
    ('pomax-mahjong', 'pomax/mahjong'),
    ('gamedolphin-minesweeper', 'gamedolphin/minesweeper'),
    ('ellisonleao-clumsy-bird', 'ellisonleao/clumsy-bird'),
    ('chvin-react-tetris', 'chvin/react-tetris'),
    ('plataformasp-mario', 'plataformasp/mario'),
    ('fabianmoronzirwas-flappy', 'fabianmoronzirwas/flappy'),
    ('ellisonleao-clumsy-bird', 'ellisonleao/clumsy-bird'),
    # Frameworks / Engines
    ('4ian-gdevelop', '4ian/GDevelop'),
    ('photonstorm-phaser3-examples', 'photonstorm/phaser3-examples'),
    ('photonstorm-phaser-examples', 'photonstorm/phaser-examples'),
    ('kittykatattack-phaser-tutorial', 'kittykatattack/Phaser'),
    ('superguigui-quintus', 'superguigui/quintus'),
    # Board/Card
    ('kevinalbs-connect4', 'kevinalbs/connect4'),
    ('brandonaaron-connect4js', 'brandonaaron/connect4js'),
    ('sahlamba-connect4', 'sahlamba/connect4'),
    ('skullops-connect-four', 'skullops/connect-four'),
    ('bocaletto-luca-backgammon', 'bocaletto/luca-backgammon'),
    ('shubhendusaurabh-draughtsboardjs', 'shubhendusaurabh/DraughtsBoardJS'),
    ('oli8-blackjackjs', 'oli8/blackjackjs'),
    # Arcade
    ('hoorayimhelping-galaga5', 'hoorayimhelping/galaga5'),
    ('blazorguy-blazorgalaga', 'blazorguy/blazorgalaga'),
    ('thirdcommand-geowars', 'thirdcommand/geowars'),
    ('judnich-kosmos', 'judnich/kosmos'),
    ('jackrugile-radius-raid-js13k', 'jackrugile/radius-raid-js13k'),
    ('phoboslab-q1k3', 'phoboslab/q1k3'),
    ('killedbyapixel-os13k', 'killedbyapixel/os13k'),
    ('killedbyapixel-bounceback', 'killedbyapixel/bounceback'),
    ('starzonmyarmz-js13k-2018', 'starzonmyarmz/js13k-2018'),
    ('auroriax-js13k-2020', 'auroriax/js13k-2020'),
    ('alexnisnevich-kalevetron', 'alexnisnevich/kalevetron'),
    ('vnglst-pong-wars', 'vnglst/pong-wars'),
    # Platformers / Adventure
    ('lukefabbian-cell-team-6-game', 'lukefabbian/cell-team-6-game'),
    ('straker-gitpark', 'straker/gitpark'),
    ('mdyn-8-bit-runner', 'mdyn/8-bit-runner'),
    ('dannz510-crossy-road', 'dannz510/crossy-road'),
    ('saket-db-crossy-roads-game-main', 'saket-db/crossy-roads-game-main'),
    ('unanimousaditya-crossy-road-game', 'unanimousaditya/crossy-road-game'),
    ('woonseah-crossy-camp', 'woonseah/crossy-camp'),
    ('mdsahil011-crossy-road-game', 'mdsahil011/crossy-road-game'),
    # Physics / Simulation
    ('maxbittker-sandspiel', 'maxbittker/sandspiel'),
    ('engineersneedart-mooncraft2000', 'engineersneedart/mooncraft2000'),
    ('monthpity-moon-room', 'monthpity/moon-room'),
    # Puzzle
    ('skammer-css-diner', 'skammer/css-diner'),
    ('knadh-wordpluck', 'knadh/wordpluck'),
    ('knadh-wordpluck', 'knadh/wordpluck'),
    ('yairch-tweetable-2048', 'yairch/tweetable-2048'),
    ('mgechev-2048-ai', 'mgechev/2048-ai'),
    ('slanha-tetris', 'slanha/tetris'),
    ('niekmeijer-tetris', 'niekmeijer/tetris'),
    ('skyler-lipman-2048', 'skyler-lipman/2048'),
    ('tinfoil-tetris', 'tinfoil/tetris'),
    # Shooting
    ('gverbock-gemgem', 'gverbock/gemgem'),
    ('christopherkesson-sokoban', 'christopherkesson/sokoban'),
    ('plathip-pacman', 'Platzh1rsk/pacman-html5'),
    ('sinceraxy-gamehub', 'sinceraxy/gamehub'),
    ('somyadipghosh-web-games', 'somyadipghosh/web-games'),
    # Misc quality
    ('chromegaming-gamesphere', 'chromegaming/GameSphere'),
    ('kunjgit-gamezone', 'kunjgit/GameZone'),
    ('cloudkidstudio-pixiflash', 'CloudKidStudio/pixiflash'),
    ('ncase-wbwwb', 'ncase/wbwwb'),
    ('bdr76-lcdgame-js', 'bdr76/lcdgame-js'),
    ('beg-in-vue-babylonjs', 'beg-in/vue-babylonjs'),
    ('stephenmkim-tiny-pong', 'stephenmkim/tiny-pong'),
    ('leanforge-snake-game', 'leanforge/snake-game'),
    ('skullops-connect-four', 'skullops/connect-four'),
    ('aerolab-blockrain-js', 'aerolab/blockrain.js'),
    ('end3r-platformer-game-template', 'end3r/HTML5-Game-Development'),
    ('alexnisnevich-untrusted', 'alexnisnevich/untrusted'),
    ('adarkroom', 'davekimpton/adarkroom'),
    ('nonstopgames-acow', 'nonstopgames/acow'),
    ('mattskala-html5-bombergirl', 'mattskala/html5-bombergirl'),
    ('equim-chan-mortal', 'equim-chan/mortal'),
    ('hrbrmstr-pewpew', 'hrbrmstr/pewpew'),
    ('rekindleos-rekindle', 'rekindleos/rekindle'),
    ('shaunlebron-bl1nd-ld28', 'shaunlebron/bl1nd-ld28'),
    ('phoboslab-jspot', 'phoboslab/jspot'),
    ('rekindleos-rekindle', 'rekindleos/rekindle'),
    ('coding-horror-basic-computer-games', 'coding-horror/basic-computer-games'),
    ('9001-copyparty', '9001/copyparty'),
    ('butzyung-systemanimatoronline', 'butzyung/systemanimatoronline'),
    ('omarshehata-i-spy-a-ghost', 'omarshehata/i-spy-a-ghost'),
    ('greypants-blastengine', 'greypants/blastengine'),
    ('icecreamyou-html5-canvas-game-boilerplate', 'icecreamyou/HTML5-Canvas-Game-Boilerplate'),
]


def make_slug(repo):
    return ''.join(c if c.isalnum() else '-' for c in repo.lower()).strip('-')[:60]


def is_framework_repo(name, description=''):
    name_lower = name.lower()
    desc_lower = (description or '').lower()
    skip_patterns = [
        'starter', 'template', 'boilerplate', 'seed', 'scaffold',
        'framework', 'engine', 'library', 'sdk', 'toolkit',
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


def fetch_one_game(repo, slug, out_dir='public/games'):
    """Fetch a single game repo. Returns (title, cat, downloaded_count, score) or None."""
    try:
        best_content = None
        best_score = 0
        best_path = ''

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

        if best_score < 5:
            all_files = get_dir_tree(repo, max_depth=2)
            html_files = [f for f in all_files
                          if f.get('name', '').endswith('.html')
                          or f.get('name', '').endswith('.htm')]
            def html_sort_key(f):
                n = f.get('name', '').lower()
                if n == 'index.html': return 0
                if n == 'game.html': return 1
                if n == 'play.html': return 2
                return 3
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

        base = best_path.rsplit('/', 1)[0] if '/' in best_path else ''
        if base:
            dir_files = get_dir_tree(repo, base, max_depth=3)
        else:
            dir_files = get_dir_tree(repo, '', max_depth=2)

        game_files = []
        for f in dir_files:
            n = f.get('name', '').lower()
            ext = n.split('.')[-1] if '.' in n else ''
            if ext in {
                '', 'html', 'htm', 'js', 'json', 'wasm', 'txt', 'md',
                'mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac',
                'woff', 'woff2', 'ttf', 'otf', 'eot', 'svg',
                'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico',
                'ogv', 'mp4', 'webm',
            }:
                game_files.append(f)

        downloaded = download_game_dir(repo, base, game_files, slug, out_dir)
        cat = categorize(best_content)
        return best_content, cat, downloaded, best_score
    except:
        return None


# =========================================================================
# PARALLEL FETCHING ENGINE
# =========================================================================
MAX_CONCURRENT = 5
_fetch_sem = Semaphore(MAX_CONCURRENT)

def parallel_fetch(tasks):
    """Fetch multiple games concurrently."""
    results = []
    total = len(tasks)
    completed = 0

    def worker(repo, slug, out_dir):
        with _fetch_sem:
            return fetch_one_game(repo, slug, out_dir)

    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT) as executor:
        futures = {
            executor.submit(worker, repo, slug, 'public/games'): (repo, slug)
            for repo, slug in tasks
        }
        for future in as_completed(futures):
            repo, slug = futures[future]
            completed += 1
            try:
                result = future.result()
                if result:
                    content, cat, downloaded, score = result
                    results.append((repo, slug, cat, downloaded, score))
                    print(f"[{completed}/{total}] OK: {slug} ({downloaded} files, score={score})")
                else:
                    print(f"[{completed}/{total}] FAIL: {slug}")
            except Exception as e:
                print(f"[{completed}/{total}] ERROR: {slug} - {e}")

    return results


# =========================================================================
# MAIN
# =========================================================================
def main():
    out_dir = 'public/games'
    os.makedirs(out_dir, exist_ok=True)

    print("=" * 70)
    print("MEGA PARALLEL GAME FETCHER")
    print("=" * 70)

    all_repos = {}
    seen = set()

    # Add known games
    print(f"\n[1] Known game repos ({len(KNOWN_GAMES)})...")
    for slug, repo in KNOWN_GAMES:
        if repo not in seen:
            all_repos[repo] = slug
            seen.add(repo)
    print(f"    Total repos so far: {len(all_repos)}")

    # Search queries
    print(f"\n[2] Searching {len(SEARCH_QUERIES)} queries...")
    for i, q in enumerate(SEARCH_QUERIES):
        print(f"  [{i+1}/{len(SEARCH_QUERIES)}] {q[:60]}...", end='', flush=True)
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
                    all_repos[repo] = make_slug(repo)
                    seen.add(repo)
                    count += 1
            print(f" -> {count} new (total: {len(all_repos)})")
            time.sleep(1.2)
        except Exception as e:
            print(f" Error: {e}")
            time.sleep(3)

    print(f"\n=== TOTAL REPOS: {len(all_repos)} ===")

    # Filter out already-existing dirs with content
    print(f"\n[3] Checking existing games...")
    tasks = []
    for repo, slug in all_repos.items():
        game_path = f"{out_dir}/{slug}"
        if os.path.isdir(game_path):
            existing = [f for f in os.listdir(game_path) if os.path.isfile(os.path.join(game_path, f))]
            if len(existing) >= 3:
                print(f"  SKIP {slug} (already exists)")
                continue
        tasks.append((repo, slug))

    print(f"\n[4] Fetching {len(tasks)} games in parallel (max {MAX_CONCURRENT} concurrent)...")

    results = parallel_fetch(tasks)

    # Summary
    total_files = sum(r[3] for r in results)
    print(f"\n" + "=" * 70)
    print(f"MEGA FETCH COMPLETE")
    print(f"  Games fetched: {len(results)}")
    print(f"  Total files:  {total_files}")
    print(f"  Categories: ", end='')
    cats = {}
    for _, _, cat, _, _ in results:
        cats[cat] = cats.get(cat, 0) + 1
    print(', '.join(f"{k}({v})" for k, v in sorted(cats.items())))
    print(f"=" * 70)
    return results


if __name__ == '__main__':
    main()
