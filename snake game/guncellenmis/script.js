const playBoard = document.querySelector(".play-board");
const scoreElement = document.querySelector(".score");
const highScoreElement = document.querySelector(".high-score");
const controls = document.querySelectorAll(".controls i");

let gameOver = false;
// Foods array will hold multiple food items ({x,y,type,id})
let foods = [];
let snakeX = 5, snakeY = 5;
let velocityX = 0, velocityY = 0;
let snakeBody = [];
let setIntervalId;
let score = 0;
// Direction lock: prevents multiple direction changes within one tick
let directionLocked = false;

// Config: number of normal foods and special boost foods
const NUM_NORMAL_FOOD = 2;
const NUM_SPECIAL_FOOD = 1;
const NUM_SUPER_FOOD = 0; // super foods are spawned periodically now
const NUM_ORANGE_FOOD = 1; // single orange food
// Game speed in milliseconds (higher = slower). Adjust to taste.
const GAME_SPEED = 110;
let currentSpeed = GAME_SPEED;
// Boost config
const BOOST_DURATION = 10000; // ms (10 seconds)
// Boost (red) slows game to 0.7x (longer interval)
const BOOST_MULTIPLIER = 0.7; // speed multiplier when boost active (0.7x => slower)
const MIN_SPEED = 40; // minimum interval (ms)
let boostActive = false;
let boostTimer = null;
let baseSpeed = GAME_SPEED; // baseline speed (GAME_SPEED)
let boostEndTime = null; // timestamp when boost ends
// Super-boost (larger) config
const SUPER_BOOST_DURATION = 5000; // ms (5 seconds)
// Super boost increases speed by 1.3x
const SUPER_BOOST_MULTIPLIER = 1.3; // speed multiplier for super boost (1.3x)
let superBoostActive = false;
let superBoostTimer = null;
let superBoostEndTime = null;
// Super spawn management: interval and removal timers by food id
let superSpawnInterval = null;
const superRemovalTimers = new Map();
// Orange effect: doubles growth for 10s and sets snake color orange
let orangeActive = false;
let orangeTimer = null;
let orangeEndTime = null;
// Pause state and remaining timers when paused
let paused = false;
let boostRemaining = 0;
let superBoostRemaining = 0;
const NORMAL_FOOD_LIFETIME = 10000; // ms before a normal food disappears
// Colored food cooldown after eaten (ms)
const COLORED_COOLDOWN_MS = 15000; // 15 seconds
const colorCooldowns = { /* type: timestamp when allowed again */ };

// Getting high score from the local storage
let highScore = localStorage.getItem("high-score") || 0;
highScoreElement.innerText = `High Score: ${highScore}`;

const randPos = () => Math.floor(Math.random() * 30) + 1;

// Return a free position {x,y} not in `occupiedSet` (Set of 'x,y').
// Tries random attempts first, then falls back to scanning the grid for any free cell.
const getFreePosition = (occupiedSet = new Set()) => {
    // try random attempts
    for (let i = 0; i < 60; i++) {
        const x = randPos();
        const y = randPos();
        const key = `${x},${y}`;
        if (!occupiedSet.has(key)) return { x, y };
    }
    // fallback: scan entire grid for free cells
    const candidates = [];
    for (let xx = 1; xx <= 30; xx++) {
        for (let yy = 1; yy <= 30; yy++) {
            const key = `${xx},${yy}`;
            if (!occupiedSet.has(key)) candidates.push({ x: xx, y: yy });
        }
    }
    if (candidates.length === 0) return null; // no free cell
    return candidates[Math.floor(Math.random() * candidates.length)];
}
const generateFoods = () => {
    foods = [];
    // build occupied set from current snake body so foods don't spawn inside snake
    const occupied = new Set();
    snakeBody.forEach(p => occupied.add(`${p[0]},${p[1]}`));
    // Add normal foods
    for (let i = 0; i < NUM_NORMAL_FOOD; i++) {
        const pos = getFreePosition(occupied);
        if (!pos) break;
        const key = `${pos.x},${pos.y}`;
        occupied.add(key);
        foods.push({ x: pos.x, y: pos.y, type: 'normal', id: `n${Date.now()}${i}`, spawnedAt: Date.now() });
    }
    // Add special boost foods (regular boost)
    for (let i = 0; i < NUM_SPECIAL_FOOD; i++) {
        const now = Date.now();
        // skip boost spawn if boost is on cooldown
        if (colorCooldowns['boost'] && now < colorCooldowns['boost']) continue;
        const pos = getFreePosition(occupied);
        if (!pos) break;
        const key = `${pos.x},${pos.y}`;
        occupied.add(key);
        foods.push({ x: pos.x, y: pos.y, type: 'boost', id: `b${Date.now()}${i}`, spawnedAt: Date.now() });
    }
    // Add orange foods
    for (let i = 0; i < NUM_ORANGE_FOOD; i++) {
        const now2 = Date.now();
        if (colorCooldowns['orange'] && now2 < colorCooldowns['orange']) continue;
        const pos = getFreePosition(occupied);
        if (!pos) break;
        const key = `${pos.x},${pos.y}`;
        occupied.add(key);
        foods.push({ x: pos.x, y: pos.y, type: 'orange', id: `o${Date.now()}${i}`, spawnedAt: Date.now() });
    }
    // add multiple larger "super" boosts
    for (let i = 0; i < NUM_SUPER_FOOD; i++) {
        const pos = getFreePosition(occupied);
        if (!pos) break;
        const key = `${pos.x},${pos.y}`;
        occupied.add(key);
        foods.push({ x: pos.x, y: pos.y, type: 'super', id: `s${Date.now()}${i}`, spawnedAt: Date.now() });
    }
}

// Recompute and apply currentSpeed from any active boosts (supports stacking)
const applySpeedFromActiveBoosts = () => {
    // Do not stack boosts: use the stronger multiplier if both active.
    // Since BOOST_MULTIPLIER may be <1 (slower) and SUPER_BOOST_MULTIPLIER >1 (faster),
    // choose the multiplier that results in the biggest change from 1. We can compare
    // absolute distance from 1 and prefer the one with greater effect, but earlier
    // behavior used Math.max; keep consistent by selecting multiplier that yields
    // the smallest interval if >1 (faster) or largest interval if <1 (slower).
    let multiplier = 1;
    if (boostActive && superBoostActive) {
        // if one slows (<1) and one speeds (>1), pick the one with greater effect magnitude
        const boostEffect = Math.abs(1 - BOOST_MULTIPLIER);
        const superEffect = Math.abs(1 - SUPER_BOOST_MULTIPLIER);
        multiplier = boostEffect > superEffect ? BOOST_MULTIPLIER : SUPER_BOOST_MULTIPLIER;
    } else if (boostActive) {
        multiplier = BOOST_MULTIPLIER;
    } else if (superBoostActive) {
        multiplier = SUPER_BOOST_MULTIPLIER;
    }
    const newSpeed = Math.max(MIN_SPEED, Math.floor(GAME_SPEED / multiplier));
    if (newSpeed !== currentSpeed) {
        currentSpeed = newSpeed;
        clearInterval(setIntervalId);
        setIntervalId = setInterval(initGame, currentSpeed);
    }
}

const respawnFood = (index) => {
    // Replace food at index with a new item of the same type, avoiding snake and other foods
    const type = foods[index].type;
    // build occupied set: snake body + other foods (except the one we're respawning)
    const occupied = new Set();
    snakeBody.forEach(p => occupied.add(`${p[0]},${p[1]}`));
    foods.forEach((f, idx) => {
        if (idx === index) return;
        occupied.add(`${f.x},${f.y}`);
    });
    const pos = getFreePosition(occupied);
    if (!pos) {
        // no free spot — as fallback, keep the food at its current position
        return;
    }
    // If the type is a colored food and it's on cooldown, convert to normal instead
    if ((type === 'boost' || type === 'super' || type === 'orange') && colorCooldowns[type] && Date.now() < colorCooldowns[type]) {
        // Place a normal food now and schedule an attempt to replace it with the colored food
        foods[index] = { x: pos.x, y: pos.y, type: 'normal', id: `n${Date.now()}${index}`, spawnedAt: Date.now() };
        try {
            const remaining = colorCooldowns[type] - Date.now();
            if (remaining > 0) {
                // Schedule a single attempt to promote this slot to the original colored type
                setTimeout(() => {
                    // Make sure the slot still exists and hasn't been eaten or replaced
                    if (index < 0 || index >= foods.length) return;
                    const current = foods[index];
                    // If the current slot was removed or is no longer the normal we set, skip
                    if (!current || current.type !== 'normal') return;
                    // Build an occupied set (snake + other foods except this slot)
                    const occupied = new Set();
                    snakeBody.forEach(p => occupied.add(`${p[0]},${p[1]}`));
                    foods.forEach((f, idx) => { if (idx === index) return; occupied.add(`${f.x},${f.y}`); });
                    const p2 = getFreePosition(occupied);
                    if (!p2) return;
                    // Only promote if cooldown has passed
                    if (!colorCooldowns[type] || Date.now() >= colorCooldowns[type]) {
                        foods[index] = { x: p2.x, y: p2.y, type, id: `${type}${Date.now()}${index}`, spawnedAt: Date.now() };
                    }
                }, remaining);
            }
        } catch (e) {
            // If anything goes wrong with scheduling, silently fallback to normal food.
            console.error('Failed scheduling colored respawn:', e);
        }
    } else {
        foods[index] = { x: pos.x, y: pos.y, type, id: `${type}${Date.now()}${index}`, spawnedAt: Date.now() };
    }
}

// Periodically spawn a transient super food every 10s and remove it after 7s if not eaten
const spawnTransientSuper = () => {
    const occupied = new Set();
    snakeBody.forEach(p => occupied.add(`${p[0]},${p[1]}`));
    foods.forEach(f => occupied.add(`${f.x},${f.y}`));
    // Do not spawn super if it's on cooldown
    if (colorCooldowns['super'] && Date.now() < colorCooldowns['super']) return;
    const pos = getFreePosition(occupied);
    if (!pos) return;
    const id = `s${Date.now()}`;
    const foodObj = { x: pos.x, y: pos.y, type: 'super', id, spawnedAt: Date.now() };
    foods.push(foodObj);
    // schedule removal after 7s if not eaten
    const removal = setTimeout(() => {
        // find index, if still present remove it
        const idx = foods.findIndex(f => f.id === id);
        if (idx !== -1) {
            foods.splice(idx, 1);
        }
        superRemovalTimers.delete(id);
    }, 7000);
    superRemovalTimers.set(id, removal);
}

// start periodic spawner (every 10s)
if (superSpawnInterval) clearInterval(superSpawnInterval);
superSpawnInterval = setInterval(spawnTransientSuper, 10000);

const handleGameOver = () => {
    // Clearing the timer and reloading the page on game over
    clearInterval(setIntervalId);
    alert("Game Over! Press OK to replay...");
    location.reload();
}

const changeDirection = e => {
    // Prevent multiple direction inputs within the same game tick
    if (directionLocked || paused) return;
    // Changing velocity value based on key press
    // Prevent immediate 180-degree reversal: only allow a new direction
    // if it's not the exact opposite of the current velocity.
    if (e.key === "ArrowUp" && velocityY !== 1) {
        velocityX = 0;
        velocityY = -1;
        directionLocked = true;
    } else if (e.key === "ArrowDown" && velocityY !== -1) {
        velocityX = 0;
        velocityY = 1;
        directionLocked = true;
    } else if (e.key === "ArrowLeft" && velocityX !== 1) {
        velocityX = -1;
        velocityY = 0;
        directionLocked = true;
    } else if (e.key === "ArrowRight" && velocityX !== -1) {
        velocityX = 1;
        velocityY = 0;
        directionLocked = true;
    }
}

// Calling changeDirection on each key click and passing key dataset value as an object
controls.forEach(button => button.addEventListener("click", () => changeDirection({ key: button.dataset.key })));

const initGame = () => {
    if(gameOver) return handleGameOver();
    let html = '';

    // Render all foods (use index loop so we can respawn/time-out items)
    for (let idx = 0; idx < foods.length; idx++) {
        let f = foods[idx];
        // If normal food lived too long, respawn it elsewhere
        if (f.type === 'normal' && Date.now() - (f.spawnedAt || 0) >= NORMAL_FOOD_LIFETIME) {
            respawnFood(idx);
            f = foods[idx];
        }
        const cls = f.type === 'boost' ? 'food boost' : (f.type === 'super' ? 'food super' : (f.type === 'orange' ? 'food orange' : 'food'));
        html += `<div class="${cls}" style="grid-area: ${f.y} / ${f.x}" data-id="${f.id}"></div>`;
        // Check collision with this food
        if (snakeX === f.x && snakeY === f.y) {
            // Normal food: grow by 1, boost: grow by 2 and increase speed
            if (f.type === 'normal') {
                snakeBody.push([f.x, f.y]);
                score++;
            } else if (f.type === 'boost') {
                // Grow twice (base 2 segments)
                const baseGrow = 2;
                const grow = orangeActive ? baseGrow * 2 : baseGrow; // double growth if orange active
                for (let g = 0; g < grow; g++) snakeBody.push([f.x, f.y]);
                score += grow;
                // apply or refresh red boost (color + slow)
                if (boostTimer) clearTimeout(boostTimer);
                boostActive = true;
                boostEndTime = Date.now() + BOOST_DURATION;
                // visual: make snake red
                playBoard.classList.add('snake-boost');
                boostTimer = setTimeout(() => {
                    boostActive = false;
                    boostEndTime = null;
                    boostTimer = null;
                    // remove red visual
                    playBoard.classList.remove('snake-boost');
                    applySpeedFromActiveBoosts();
                }, BOOST_DURATION);
                // recompute speed immediately
                applySpeedFromActiveBoosts();
                // set cooldown for boost so it doesn't reappear for a while
                colorCooldowns['boost'] = Date.now() + COLORED_COOLDOWN_MS;
            } else if (f.type === 'super') {
                // Super boost: grow by 10 (base)
                const baseSuperGrow = 10;
                const growSuper = orangeActive ? baseSuperGrow * 2 : baseSuperGrow;
                for (let g = 0; g < growSuper; g++) snakeBody.push([f.x, f.y]);
                score += growSuper;
                if (superBoostTimer) clearTimeout(superBoostTimer);
                superBoostActive = true;
                superBoostEndTime = Date.now() + SUPER_BOOST_DURATION;
                // visually mark snake as purple
                playBoard.classList.add('snake-super');
                superBoostTimer = setTimeout(() => {
                    superBoostActive = false;
                    superBoostEndTime = null;
                    superBoostTimer = null;
                    // remove purple visual
                    playBoard.classList.remove('snake-super');
                    applySpeedFromActiveBoosts();
                }, SUPER_BOOST_DURATION);
                applySpeedFromActiveBoosts();
                // if this super had a scheduled removal (visible timer), clear it as it's been eaten
                if (superRemovalTimers.has(f.id)) {
                    clearTimeout(superRemovalTimers.get(f.id));
                    superRemovalTimers.delete(f.id);
                }
                // set cooldown for super so it doesn't reappear for a while
                colorCooldowns['super'] = Date.now() + COLORED_COOLDOWN_MS;
            }
            else if (f.type === 'orange') {
                // Orange: base 3 segments, doubled if orangeActive (double effect stacks but we treat orangeActive as re-triggering)
                const baseOrange = 3;
                const growOrange = orangeActive ? baseOrange * 2 : baseOrange;
                for (let g = 0; g < growOrange; g++) snakeBody.push([f.x, f.y]);
                score += growOrange;
                // trigger orange effect: 10s during which all growth doubles
                if (orangeTimer) clearTimeout(orangeTimer);
                orangeActive = true;
                orangeEndTime = Date.now() + 10000;
                // visual: make snake orange
                playBoard.classList.add('snake-orange');
                orangeTimer = setTimeout(() => {
                    orangeActive = false;
                    orangeEndTime = null;
                    orangeTimer = null;
                    playBoard.classList.remove('snake-orange');
                }, 10000);
                // set cooldown for orange so it doesn't reappear for a while
                colorCooldowns['orange'] = Date.now() + COLORED_COOLDOWN_MS;
            }
            else if (f.type === 'orange') {
                // Orange: grow 3 segments and award 3 points
                for (let g = 0; g < 3; g++) snakeBody.push([f.x, f.y]);
                score += 3;
            }
            // Update scores
            highScore = score >= highScore ? score : highScore;
            localStorage.setItem("high-score", highScore);
            scoreElement.innerText = `Score: ${score}`;
            highScoreElement.innerText = `High Score: ${highScore}`;
            // Respawn the eaten food
            // For 'super' foods, do not respawn immediately here (super spawn is periodic). Replace with a normal food instead.
            if (f.type === 'super') {
                const pos = getFreePosition(new Set(snakeBody.map(p => `${p[0]},${p[1]}`)));
                if (pos) foods[idx] = { x: pos.x, y: pos.y, type: 'normal', id: `n${Date.now()}${idx}`, spawnedAt: Date.now() };
                else foods.splice(idx, 1);
            } else {
                respawnFood(idx);
            }
        }
    }
    // Updating the snake's head position based on the current velocity
    snakeX += velocityX;
    snakeY += velocityY;
    
    // Shifting forward the values of the elements in the snake body by one
    for (let i = snakeBody.length - 1; i > 0; i--) {
        snakeBody[i] = snakeBody[i - 1];
    }
    snakeBody[0] = [snakeX, snakeY]; // Setting first element of snake body to current snake position

    // Unlock direction changes for the next tick
    directionLocked = false;

    // Checking if the snake's head is out of wall, if so setting gameOver to true
    if(snakeX <= 0 || snakeX > 30 || snakeY <= 0 || snakeY > 30) {
        return gameOver = true;
    }

    for (let i = 0; i < snakeBody.length; i++) {
        // Adding a div for each part of the snake's body
        html += `<div class="head" style="grid-area: ${snakeBody[i][1]} / ${snakeBody[i][0]}"></div>`;
        // Checking if the snake head hit the body, if so set gameOver to true
        if (i !== 0 && snakeBody[0][1] === snakeBody[i][1] && snakeBody[0][0] === snakeBody[i][0]) {
            gameOver = true;
        }
    }
    playBoard.innerHTML = html;
    // Update debug coords (if present) so user can see where the head is
    const dbg = document.querySelector('.debug-coords');
    if (dbg) {
        dbg.style.display = 'inline-block';
        dbg.innerText = `(x:${snakeX}, y:${snakeY})`;
    }
}

// Initialize foods and start game loop
generateFoods();
setIntervalId = setInterval(initGame, currentSpeed);
document.addEventListener("keydown", changeDirection);

// Toggle pause with Spacebar (also prevents page scrolling)
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        togglePause();
    }
});

// Boost timer display updater
const boostDisplayEl = document.querySelector('.boost-timer');
setInterval(() => {
    if (!boostDisplayEl) return;
    const now = Date.now();
    const remBoost = boostActive && boostEndTime ? Math.max(0, boostEndTime - now) : 0;
    const remSuper = superBoostActive && superBoostEndTime ? Math.max(0, superBoostEndTime - now) : 0;
    if (remBoost > 0 || remSuper > 0) {
        let parts = [];
        if (remBoost > 0) parts.push(`Boost: ${(remBoost/1000).toFixed(1)}s`);
        if (remSuper > 0) parts.push(`Super: ${(remSuper/1000).toFixed(1)}s`);
        boostDisplayEl.innerText = parts.join(' | ');
        boostDisplayEl.style.visibility = 'visible';
    } else {
        boostDisplayEl.innerText = `Boost: 0s`;
        boostDisplayEl.style.visibility = 'hidden';
    }
}, 100);

// Pause/resume logic: pause game loop and boost timers
const togglePause = () => {
    const btn = document.querySelector('.pause-btn');
    if (!paused) {
        // pause
        paused = true;
        // stop game loop
        clearInterval(setIntervalId);
        // pause boost timers and store remaining time
        const now = Date.now();
        if (boostActive && boostEndTime) {
            boostRemaining = Math.max(0, boostEndTime - now);
            if (boostRemaining <= 0) {
                boostActive = false;
                boostEndTime = null;
                boostRemaining = 0;
            }
            if (boostTimer) { clearTimeout(boostTimer); boostTimer = null; }
        } else {
            boostRemaining = 0;
        }
        if (superBoostActive && superBoostEndTime) {
            superBoostRemaining = Math.max(0, superBoostEndTime - now);
            if (superBoostRemaining <= 0) {
                superBoostActive = false;
                superBoostEndTime = null;
                superBoostRemaining = 0;
            }
            if (superBoostTimer) { clearTimeout(superBoostTimer); superBoostTimer = null; }
        } else {
            superBoostRemaining = 0;
        }
        if (btn) { btn.innerText = 'Resume'; btn.setAttribute('aria-pressed','true'); }
    } else {
        // resume
        paused = false;
        if (btn) { btn.innerText = 'Pause'; btn.setAttribute('aria-pressed','false'); }
        // restart game loop with currentSpeed
        clearInterval(setIntervalId);
        setIntervalId = setInterval(initGame, currentSpeed);
        const now = Date.now();
        // resume boost timers from remaining
        if (boostRemaining && boostRemaining > 0) {
            boostEndTime = now + boostRemaining;
            boostTimer = setTimeout(() => {
                boostActive = false;
                boostEndTime = null;
                boostTimer = null;
                applySpeedFromActiveBoosts();
            }, boostRemaining);
        }
        if (superBoostRemaining && superBoostRemaining > 0) {
            superBoostEndTime = now + superBoostRemaining;
            superBoostTimer = setTimeout(() => {
                superBoostActive = false;
                superBoostEndTime = null;
                superBoostTimer = null;
                applySpeedFromActiveBoosts();
            }, superBoostRemaining);
        }
        // reapply speed based on currently active boosts
        applySpeedFromActiveBoosts();
        boostRemaining = 0;
        superBoostRemaining = 0;
    }
}

// Attach pause button listener if present
const pauseBtnEl = document.querySelector('.pause-btn');
if (pauseBtnEl) pauseBtnEl.addEventListener('click', togglePause);