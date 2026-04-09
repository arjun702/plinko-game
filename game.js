(() => {
    const { Engine, Render, Runner, Bodies, Composite, Events, Body } = Matter;

    const config = {
        width: 600,
        height: 650,
        rows: 16,
        pinGap: 32,
        pinRadius: 3,
        ballRadius: 7.5,
        startY: 40,
        gravityY: 0.58,
        maxActiveBalls: 10,
        dropCooldownMs: 110
    };

    const multipliers = [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110];
    const weights = [1, 16, 120, 560, 1820, 4368, 8008, 11440, 12870, 11440, 8008, 4368, 1820, 560, 120, 16, 1];
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);

    const state = {
        balance: 1000,
        activeBalls: [],
        lastDropTime: 0
    };

    const ui = {
        balance: document.getElementById("balance"),
        betAmount: document.getElementById("betAmount"),
        betButton: document.getElementById("betButton"),
        lastWin: document.getElementById("last-win"),
        canvasContainer: document.getElementById("canvas-container")
    };

    const engine = Engine.create();
    engine.gravity.y = config.gravityY;
    engine.constraintIterations = 3;
    engine.positionIterations = 8;
    engine.velocityIterations = 6;

    const render = Render.create({
        element: ui.canvasContainer,
        engine,
        options: {
            width: config.width,
            height: config.height,
            wireframes: false,
            background: "transparent",
            pixelRatio: window.devicePixelRatio > 1 ? 2 : 1
        }
    });

    const runner = Runner.create({
        isFixed: true,
        delta: 1000 / 120
    });

    function updateBalance() {
        ui.balance.textContent = `$${state.balance.toFixed(2)}`;
    }

    function setWinText(text, isWin) {
        ui.lastWin.textContent = text;
        ui.lastWin.style.color = isWin ? "var(--green)" : "var(--danger)";
    }

    function parseBetAmount() {
        const bet = Number.parseFloat(ui.betAmount.value);
        return Number.isFinite(bet) ? bet : NaN;
    }

    function validateBet(bet) {
        if (!Number.isFinite(bet) || bet <= 0) {
            return "Enter a valid bet amount.";
        }
        if (bet > state.balance) {
            return "Insufficient balance.";
        }
        return null;
    }

    function getOutcomeIndex() {
        const rand = Math.random();
        let cumulative = 0;

        for (let i = 0; i < weights.length; i += 1) {
            cumulative += weights[i] / totalWeight;
            if (rand <= cumulative) {
                return i;
            }
        }

        return Math.floor(weights.length / 2);
    }

    function getTargetXForBucket(bucketIndex) {
        return (config.width / 2) - ((config.rows * config.pinGap) / 2) + (bucketIndex * config.pinGap);
    }

    function createPins() {
        for (let row = 2; row <= config.rows; row += 1) {
            const rowWidth = row * config.pinGap;
            const startX = (config.width / 2) - (rowWidth / 2);
            for (let col = 0; col <= row; col += 1) {
                const pin = Bodies.circle(
                    startX + (col * config.pinGap),
                    config.startY + (row * config.pinGap),
                    config.pinRadius,
                    {
                        isStatic: true,
                        friction: 0,
                        restitution: 0.2,
                        render: { fillStyle: "#ffffff" }
                    }
                );
                Composite.add(engine.world, pin);
            }
        }
    }

    function canDropBall() {
        const now = performance.now();
        return (
            state.activeBalls.length < config.maxActiveBalls &&
            now - state.lastDropTime >= config.dropCooldownMs
        );
    }

    function playGame() {
        const bet = parseBetAmount();
        const validationError = validateBet(bet);
        if (validationError) {
            setWinText(validationError, false);
            return;
        }

        if (!canDropBall()) {
            setWinText("Please wait for current balls to progress.", false);
            return;
        }

        state.lastDropTime = performance.now();
        state.balance -= bet;
        updateBalance();
        ui.lastWin.textContent = "";

        const targetBucket = getOutcomeIndex();
        const targetX = getTargetXForBucket(targetBucket);

        const ball = Bodies.circle(config.width / 2 + ((Math.random() - 0.5) * 1.5), config.startY, config.ballRadius, {
            restitution: 0.34,
            friction: 0.02,
            frictionAir: 0.019,
            density: 0.05,
            slop: 0.05,
            render: { fillStyle: "#ff003f" },
            customData: {
                targetX,
                targetBucket,
                betAmount: bet
            }
        });

        state.activeBalls.push(ball);
        Composite.add(engine.world, ball);
    }

    function getBucketColor(index) {
        const center = Math.floor(multipliers.length / 2);
        const distance = Math.abs(index - center);

        if (distance > 6) return "#ff003f";
        if (distance > 4) return "#ff9100";
        if (distance > 2) return "#ffe600";
        return "#00e701";
    }

    function drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    function handleBallGuidanceAndPayout() {
        const lastPinY = config.startY + (config.rows * config.pinGap);

        for (let i = state.activeBalls.length - 1; i >= 0; i -= 1) {
            const ball = state.activeBalls[i];
            const { targetX, targetBucket, betAmount } = ball.customData;

            if (ball.position.y > 80 && ball.position.y < config.height - 20) {
                const errorX = targetX - ball.position.x;

                if (ball.position.y > lastPinY) {
                    Body.setPosition(ball, {
                        x: ball.position.x + (errorX * 0.14),
                        y: ball.position.y
                    });
                    Body.setVelocity(ball, { x: ball.velocity.x * 0.75, y: ball.velocity.y });
                } else {
                    const fallRatio = ball.position.y / config.height;
                    const dynamicForce = 0.00001 + (fallRatio * 0.00003);
                    Body.applyForce(ball, ball.position, { x: errorX * dynamicForce, y: 0 });
                }
            }

            if (ball.position.y > config.height + 20) {
                const winAmount = betAmount * multipliers[targetBucket];
                state.balance += winAmount;
                updateBalance();
                setWinText(`+ $${winAmount.toFixed(2)}`, winAmount >= betAmount);

                Composite.remove(engine.world, ball);
                state.activeBalls.splice(i, 1);
            }
        }
    }

    function drawBuckets() {
        const ctx = render.context;
        const bucketY = config.startY + (config.rows * config.pinGap) + 15;
        const bucketWidth = config.pinGap - 4;
        const bucketStartX = (config.width / 2) - ((multipliers.length * config.pinGap) / 2);

        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 9px 'Segoe UI'";

        multipliers.forEach((value, index) => {
            const x = bucketStartX + (index * config.pinGap) + 2;

            ctx.fillStyle = getBucketColor(index);
            drawRoundedRect(ctx, x, bucketY, bucketWidth, 22, 4);
            ctx.fill();

            ctx.fillStyle = "#000";
            ctx.fillText(`${value}x`, x + (bucketWidth / 2), bucketY + 14);
        });

        ctx.restore();
    }

    function registerEvents() {
        ui.betButton.addEventListener("click", playGame);
        ui.betAmount.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                playGame();
            }
        });

        Events.on(engine, "beforeUpdate", handleBallGuidanceAndPayout);
        Events.on(render, "afterRender", drawBuckets);
    }

    function init() {
        createPins();
        registerEvents();
        updateBalance();
        Render.run(render);
        Runner.run(runner, engine);
    }

    init();
})();
