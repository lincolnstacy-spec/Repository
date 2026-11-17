
/* ==========================================
   KAM'S GAMES
   Game catalog and player
========================================== */

const CDN =
    "https://cdn.jsdelivr.net/gh/GoatTech-42/NEBULACDN@main";

const CATALOG_URL = `${CDN}/games.json`;

const INITIAL_GAME_LIMIT = 60;
const LOAD_MORE_LIMIT = 60;

let allGames = [];
let visibleGames = [];
let displayedGameLimit = INITIAL_GAME_LIMIT;
let currentGame = null;
let currentFilter = "all";
let favorites = JSON.parse(
    localStorage.getItem("kamsGameFavorites") || "[]"
);


/* ==========================================
   ELEMENTS
========================================== */

const gamesGrid = document.getElementById("gamesGrid");
const gameSearch = document.getElementById("gameSearch");
const sortGames = document.getElementById("sortGames");
const gameCount = document.getElementById("gameCount");

const gameModal = document.getElementById("gameModal");
const gameFrame = document.getElementById("gameFrame");
const gameTitle = document.getElementById("gameTitle");

const featuredGame = document.getElementById("featuredGame");
const loadError = document.getElementById("loadError");


/* ==========================================
   LOAD GAME CATALOG
========================================== */

async function loadGames() {
    try {
        gamesGrid.innerHTML =
            '<div class="loading-message">Loading games...</div>';

        const response = await fetch(CATALOG_URL, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Could not load game catalog.");
        }

        const catalog = await response.json();

        if (!catalog.games || !Array.isArray(catalog.games)) {
            throw new Error("Invalid game catalog.");
        }

        allGames = catalog.games
            .filter(game => game.name && game.file)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(game => ({
                ...game,
                category: game.category || "Other",
                url: `${CDN}/${game.file}`
            }));

        renderCategoryFilters();

        if (allGames.length === 0) {
            throw new Error("No compatible games were found.");
        }

        loadError.hidden = true;

        renderGames();
        renderFeaturedGame();

    } catch (error) {
        console.error("Game loading error:", error);

        gamesGrid.innerHTML = "";
        loadError.hidden = false;
        gameCount.textContent = "Unable to load games.";
    }
}


/* ==========================================
   GAME ICONS
========================================== */

function getGameIcon(category) {
    const icons = {
        Puzzle: "🧩",
        Arcade: "🕹️",
        Racing: "🏎️",
        Sports: "🏆",
        Platformer: "🎮",
        Strategy: "♟️",
        Simulation: "🌎"
    };

    return icons[category] || "🎮";
}

const thumbnailCache = new Map();

async function resolveGameThumbnail(game) {
    if (thumbnailCache.has(game.id)) {
        return thumbnailCache.get(game.id);
    }

    try {
        const response = await fetch(game.url, { cache: "force-cache" });
        if (!response.ok) throw new Error("Thumbnail wrapper request failed.");

        const html = await response.text();
        const baseMatch = html.match(/<base[^>]+href=["']([^"']+)/i);
        const baseUrl = baseMatch?.[1]
            ? new URL(baseMatch[1], game.url).href
            : game.url;

        const candidates = [];

        const metaMatches = [
            ...html.matchAll(/<meta[^>]+(?:property|name)=["'][^"']*(?:og:image|twitter:image)[^"']*["'][^>]+content=["']([^"']+)/gi),
            ...html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'][^"']*(?:og:image|twitter:image)[^"']*["']/gi)
        ];

        metaMatches.forEach(match => candidates.push(match[1]));

        [...html.matchAll(/<(?:img|image)[^>]+(?:src|href)=["']([^"']+)/gi)]
            .forEach(match => candidates.push(match[1]));

        [...html.matchAll(/(?:src|poster|image)[=:]["']([^"']+\.(?:png|jpe?g|webp))/gi)]
            .forEach(match => candidates.push(match[1].replace(/^['"]/, "")));

        const resolvedCandidates = [];

        for (const candidate of candidates) {
            if (!candidate || candidate.startsWith("data:")) continue;

            let resolved;

            if (candidate.startsWith("//")) {
                resolved = `https:${candidate}`;
            } else if (/^https?:/i.test(candidate)) {
                resolved = candidate.replace(/^http:/i, "https:");
            } else {
                resolved = new URL(candidate, baseUrl).href;
            }

            if (!resolvedCandidates.includes(resolved)) {
                resolvedCandidates.push(resolved);
            }
        }

        for (const candidate of resolvedCandidates) {
            try {
                const imageResponse = await fetch(candidate, { cache: "force-cache", mode: "cors" });
                const contentType = imageResponse.headers.get("content-type") || "";

                if (imageResponse.ok && contentType.startsWith("image/")) {
                    thumbnailCache.set(game.id, candidate);
                    return candidate;
                }
            } catch (error) {
                // Try the next candidate.
            }
        }

        try {
            const normalizedName = game.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`${game.name} video game`)}&gsrlimit=10&prop=pageimages&piprop=thumbnail&pithumbsize=640&format=json&origin=*`;
            const wikiResponse = await fetch(wikiSearchUrl, { cache: "force-cache" });

            if (wikiResponse.ok) {
                const wikiData = await wikiResponse.json();
                const pages = Object.values(wikiData.query?.pages || {});
                const exactMatch = pages.find(page => {
                    const pageName = page.title
                        .replace(/\s*\([^)]*video game[^)]*\)$/i, "")
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, "");

                    return pageName === normalizedName;
                });

                if (exactMatch?.thumbnail?.source) {
                    const wikiImageResponse = await fetch(exactMatch.thumbnail.source, {
                        cache: "force-cache",
                        mode: "cors"
                    });
                    const wikiContentType = wikiImageResponse.headers.get("content-type") || "";

                    if (wikiImageResponse.ok && wikiContentType.startsWith("image/")) {
                        thumbnailCache.set(game.id, exactMatch.thumbnail.source);
                        return exactMatch.thumbnail.source;
                    }
                }
            }
        } catch (error) {
            // No exact real cover was available.
        }

        thumbnailCache.set(game.id, null);
        return null;
    } catch (error) {
        thumbnailCache.set(game.id, null);
        return null;
    }
}

function installGameThumbnail(image, game) {
    if (!image) return;

    image.referrerPolicy = "no-referrer";
    image.decoding = "async";
    image.addEventListener("load", () => image.classList.add("loaded"), { once: true });
    image.addEventListener("error", () => image.remove(), { once: true });

    resolveGameThumbnail(game).then(url => {
        if (url) {
            image.src = url;

            setTimeout(() => {
                if (!image.complete || image.naturalWidth === 0) {
                    image.remove();
                }
            }, 10000);
        } else {
            image.remove();
        }
    }).catch(() => image.remove());
}

const displayedGamesById = new Map();


/* ==========================================
   RENDER GAME CARDS
========================================== */

function renderGames() {
    const searchTerm = gameSearch.value
        .trim()
        .toLowerCase();

    visibleGames = allGames.filter(game => {

        const matchesSearch =
            game.name.toLowerCase().includes(searchTerm) ||
            game.category.toLowerCase().includes(searchTerm);

        const matchesCategory =
            currentFilter === "all" ||
            game.category === currentFilter;

        const matchesFavorites =
            currentFilter !== "favorites" ||
            favorites.includes(game.id);

        return matchesSearch &&
            (currentFilter === "favorites"
                ? matchesFavorites
                : matchesCategory);
    });

    const sortValue = sortGames.value;

    visibleGames.sort((a, b) => {
        if (sortValue === "za") {
            return b.name.localeCompare(a.name);
        }

        return a.name.localeCompare(b.name);
    });

    gameCount.textContent =
        `${visibleGames.length} games available`;

    if (visibleGames.length === 0) {
        gamesGrid.innerHTML = `
            <div class="empty-message">
                No games found.
            </div>
        `;

        return;
    }

    const displayedGames = visibleGames.slice(0, displayedGameLimit);

    gamesGrid.innerHTML = displayedGames.map(game => `
        <article class="game-card">

            <button
                class="game-card-main"
                data-play="${escapeAttribute(game.id)}"
                aria-label="Play ${escapeAttribute(game.name)}">

                <div class="game-thumbnail">
                    <img
                        data-game-thumbnail="${escapeAttribute(game.id)}"
                        alt="${escapeAttribute(game.name)} game thumbnail"
                        loading="eager"
                        decoding="async">
                </div>

                <div class="game-info">
                    <span class="game-category">
                        ${escapeHTML(game.category)}
                    </span>

                    <h3>${escapeHTML(game.name)}</h3>

                    <p>
                        ${escapeHTML(
                            game.description ||
                            "Click to start playing."
                        )}
                    </p>
                </div>

            </button>

            <button
                class="favorite-button ${favorites.includes(game.id) ? "favorited" : ""}"
                data-favorite="${escapeAttribute(game.id)}"
                aria-label="Toggle favorite">

                ${favorites.includes(game.id) ? "♥" : "♡"}

            </button>

        </article>
    `).join("") + `
        <div class="load-more-wrap" ${visibleGames.length <= displayedGameLimit ? "hidden" : ""}>
            <button id="loadMoreGames" class="load-more-button">Load More Games</button>
        </div>
    `;

    displayedGamesById.clear();
    displayedGames.forEach(game => displayedGamesById.set(game.id, game));

    document.querySelectorAll("[data-game-thumbnail]").forEach(image => {
        const game = displayedGamesById.get(image.dataset.gameThumbnail);
        if (game) installGameThumbnail(image, game);
    });

    const loadMoreButton = document.getElementById("loadMoreGames");
    if (loadMoreButton) {
        loadMoreButton.addEventListener("click", () => {
            displayedGameLimit += LOAD_MORE_LIMIT;
            renderGames();
        });
    }
}


/* ==========================================
   FEATURED GAME
========================================== */

function renderFeaturedGame() {
    if (!allGames.length) return;

    const game = allGames[0];

    featuredGame.innerHTML = `
        <div class="featured-content">

            <div class="featured-art">
                <img
                    id="featuredGameImage"
                    alt="${escapeAttribute(game.name)} featured game thumbnail"
                    loading="eager"
                    decoding="async">
            </div>

            <div class="featured-details">
                <span class="section-label">
                    ${escapeHTML(game.category)}
                </span>

                <h2>${escapeHTML(game.name)}</h2>

                <p>
                    ${escapeHTML(
                        game.description ||
                        "Try this featured game."
                    )}
                </p>

                <button
                    class="primary-button"
                    id="featuredPlayButton">

                    Play Game
                    <span>→</span>

                </button>
            </div>

        </div>
    `;

    document
        .getElementById("featuredPlayButton")
        .addEventListener("click", () => openGame(game));

    const featuredImage = document.getElementById("featuredGameImage");
    installGameThumbnail(featuredImage, game);
}


/* ==========================================
   OPEN GAME
========================================== */

async function openGame(game) {
    if (!game || !game.url) return;

    currentGame = game;
    gameTitle.textContent = game.name;

    gameModal.classList.add("active");
    document.body.style.overflow = "hidden";

    const frameContainer = document.querySelector(".game-frame-container");
    frameContainer.setAttribute("aria-busy", "true");

    gameFrame.removeAttribute("src");
    gameFrame.removeAttribute("srcdoc");

    try {
        const response = await fetch(game.url, { cache: "no-store" });

        if (!response.ok) {
            throw new Error(`Game request failed (${response.status}).`);
        }

        const source = await response.text();

        if (
            !source.includes("<html") &&
            !source.includes("<!DOCTYPE html")
        ) {
            throw new Error("The catalog returned no playable HTML.");
        }

        if (
            source.includes('player.load("$1")') ||
            source.includes("Ruffle failed to load")
        ) {
            throw new Error("This game wrapper is not configured with its game file.");
        }

        gameFrame.srcdoc = source;

    } catch (error) {
        console.error("Game loading error:", error);
        gameFrame.srcdoc = `
            <!DOCTYPE html>
            <html>
            <body style="margin:0;display:grid;place-items:center;height:100vh;background:#080911;color:#bfc3d1;font-family:Inter,system-ui,sans-serif;text-align:center">
                <div>
                    <h2 style="margin:0 0 8px;color:#fff">Unable to load ${escapeHTML(game.name)}</h2>
                    <p style="margin:0;font-size:14px">The game file could not be opened safely.</p>
                </div>
            </body>
            </html>
        `;
    } finally {
        frameContainer.setAttribute("aria-busy", "false");
    }
}


/* ==========================================
   CLOSE GAME
========================================== */

function closeGame() {
    gameModal.classList.remove("active");

    document.body.style.overflow = "";

    // Stop the game after the player closes.
    gameFrame.removeAttribute("srcdoc");
    gameFrame.src = "about:blank";

    currentGame = null;
}


/* ==========================================
   FULLSCREEN
========================================== */

async function fullscreenGame() {
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
            return;
        }

        await gameFrame.requestFullscreen();

    } catch (error) {
        console.error("Fullscreen error:", error);
    }
}


/* ==========================================
   SEPARATE TAB
   Opens about:blank containing the game.
========================================== */

function openSeparateTab() {
    if (!currentGame || !currentGame.url) return;

    // Must be opened directly from the user's click.
    const newTab = window.open("about:blank", "_blank");

    if (!newTab) {
        alert("Please allow pop-ups for Kam's Games.");
        return;
    }

    // Create a clean blank page.
    newTab.document.open();

    newTab.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${escapeHTML(currentGame.name)}</title>
            <meta name="viewport"
                content="width=device-width, initial-scale=1.0">

            <style>
                * {
                    box-sizing: border-box;
                }

                html, body {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    background: #000;
                }

                iframe {
                    display: block;
                    width: 100%;
                    height: 100%;
                    border: none;
                    background: #000;
                }
            </style>
        </head>

        <body>
            <iframe
                id="separateGameFrame"
                allow="fullscreen; autoplay; gamepad"
                allowfullscreen>
            </iframe>
        </body>
        </html>
    `);

    newTab.document.close();

    fetch(currentGame.url, { cache: "no-store" })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Game request failed (${response.status}).`);
            }
            return response.text();
        })
        .then(source => {
            if (
                !source.includes("<html") &&
                !source.includes("<!DOCTYPE html")
            ) {
                throw new Error("The catalog returned no playable HTML.");
            }

            if (
                source.includes('player.load("$1")') ||
                source.includes("Ruffle failed to load")
            ) {
                throw new Error("This game wrapper is not configured with its game file.");
            }

            const separateFrame =
                newTab.document.getElementById("separateGameFrame");

            separateFrame.srcdoc = source;
        })
        .catch(error => {
            console.error("Separate game loading error:", error);
            newTab.document.open();
            newTab.document.write(`
                <!DOCTYPE html>
                <html>
                <body style="margin:0;display:grid;place-items:center;height:100vh;background:#080911;color:#bfc3d1;font-family:Inter,system-ui,sans-serif;text-align:center">
                    <h2>Unable to open ${escapeHTML(currentGame.name)}</h2>
                </body>
                </html>
            `);
            newTab.document.close();
        });
}


/* ==========================================
   FAVORITES
========================================== */

function toggleFavorite(gameId) {
    if (favorites.includes(gameId)) {
        favorites = favorites.filter(id => id !== gameId);
    } else {
        favorites.push(gameId);
    }

    localStorage.setItem(
        "kamsGameFavorites",
        JSON.stringify(favorites)
    );

    renderGames();
}


/* ==========================================
   CATEGORY FILTERS
========================================== */

function renderCategoryFilters() {
    const container = document.querySelector(".category-filters");
    if (!container) return;

    const categories = [...new Set(allGames.map(game => game.category))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

    container.innerHTML = `
        <button class="category-button active" data-filter="all">All Games</button>
        ${categories.map(category => `
            <button class="category-button" data-filter="${escapeAttribute(category)}">${escapeHTML(category)}</button>
        `).join("")}
    `;

    container.querySelectorAll("[data-filter]").forEach(button => {
        button.addEventListener("click", () => setFilter(button.dataset.filter));
    });

    document.querySelectorAll(".sidebar-nav [data-filter]").forEach(button => {
        if (["Puzzle", "Arcade", "Racing", "Sports"].includes(button.dataset.filter)) {
            button.addEventListener("click", () => setFilter(button.dataset.filter));
        }
    });
}

function setFilter(filter) {
    currentFilter = filter;
    displayedGameLimit = INITIAL_GAME_LIMIT;

    document.querySelectorAll("[data-filter]").forEach(button => {
        button.classList.toggle("active", button.dataset.filter === filter);
    });

    renderGames();
}


/* ==========================================
   EVENT LISTENERS
========================================== */

gamesGrid.addEventListener("click", event => {

    const playButton = event.target.closest("[data-play]");

    const favoriteButton =
        event.target.closest("[data-favorite]");

    if (favoriteButton) {
        toggleFavorite(favoriteButton.dataset.favorite);
        return;
    }

    if (playButton) {
        const game = allGames.find(
            item => item.id === playButton.dataset.play
        );

        if (game) openGame(game);
    }
});


document.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
        setFilter(button.dataset.filter);
    });
});


gameSearch.addEventListener("input", () => {
    displayedGameLimit = INITIAL_GAME_LIMIT;
    renderGames();
});

sortGames.addEventListener("change", () => {
    displayedGameLimit = INITIAL_GAME_LIMIT;
    renderGames();
});

document
    .getElementById("closeGame")
    .addEventListener("click", closeGame);

document
    .getElementById("closeGameTop")
    .addEventListener("click", closeGame);

document
    .getElementById("fullscreenButton")
    .addEventListener("click", fullscreenGame);

document
    .getElementById("separateTabButton")
    .addEventListener("click", openSeparateTab);


/* ==========================================
   KEYBOARD SHORTCUTS
========================================== */

document.addEventListener("keydown", event => {

    if (event.key === "Escape" && gameModal.classList.contains("active")) {
        closeGame();
    }

    if (
        event.key.toLowerCase() === "f" &&
        gameModal.classList.contains("active") &&
        document.activeElement.tagName !== "INPUT"
    ) {
        fullscreenGame();
    }
});


/* ==========================================
   CLOCK
========================================== */

function updateClock() {
    const clock = document.getElementById("clock");

    if (!clock) return;

    clock.textContent = new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
    });
}

updateClock();
setInterval(updateClock, 1000);


/* ==========================================
   SAFE HTML HELPERS
========================================== */

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function escapeAttribute(value) {
    return escapeHTML(value);
}


/* ==========================================
   INITIALIZE
========================================== */

if (window.lucide) {
    lucide.createIcons();
}

loadGames();
